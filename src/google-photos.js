import { access, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import sharp from 'sharp';
import { fetchJson, fetchOk } from './http.js';
import { PHOTOS_ACCOUNT } from './google.js';

const API = 'https://photospicker.googleapis.com/v1';
const PARALLEL = 4; // links expire after 60 minutes, so 2000 photos must not go one by one
const DEFAULT_TIMEOUT_S = 30 * 60;
const seconds = (s, fallback) => (Number.parseFloat(s) > 0 ? Number.parseFloat(s) : fallback);
const fileName = (id) => `${createHash('sha256').update(id).digest('hex').slice(0, 24)}.jpg`;
const exists = (path) => access(path).then(() => true, () => false);

/** Copies photos the owner picks in Google Photos to a local folder. */
export class PhotoImport {
  #run = 0;
  status = 'No import since the last start.';

  constructor({ google, dir, onDone = () => {}, log = console.error, wait = sleep }) {
    Object.assign(this, { google, dir, onDone, log, wait });
  }

  async #headers() { return { authorization: `Bearer ${await this.google.accessToken(PHOTOS_ACCOUNT)}` }; }

  /** Starts a picking session; the import then runs in the background. */
  async start(replace) {
    const session = await fetchJson(`${API}/sessions`, {
      method: 'POST', headers: { ...(await this.#headers()), 'content-type': 'application/json' }, body: '{}',
    });
    if (new URL(session.pickerUri).protocol !== 'https:') throw new Error('Unexpected picker address');
    this.#run += 1;
    this.status = 'Waiting for you to pick photos.';
    this.finished = this.#background(session, replace, this.#run);
    return `${session.pickerUri}/autoclose`;
  }

  async #background(session, replace, run) {
    try {
      if (!(await this.#picked(session, run))) return;
      const result = await this.#download(await this.#items(session.id), replace, run);
      await fetchOk(`${API}/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE', headers: await this.#headers() })
        .catch((err) => this.log('photo session cleanup:', err.message));
      this.#report(run, result);
      await this.onDone();
    } catch (err) {
      this.log('photo import:', err.message);
      this.#report(run, `Import failed: ${err.message}`);
    }
  }

  // A newer import owns the status line.
  #report(run, text) { if (run === this.#run) this.status = text; }

  async #picked({ id, pollingConfig }, run) {
    const every = seconds(pollingConfig?.pollInterval, 5);
    const limit = seconds(pollingConfig?.timeoutIn, DEFAULT_TIMEOUT_S);
    for (let waited = 0; waited < limit; waited += every) {
      await this.wait(every * 1000);
      if (run !== this.#run) return false;
      const session = await fetchJson(`${API}/sessions/${encodeURIComponent(id)}`, { headers: await this.#headers() });
      if (session.mediaItemsSet) return true;
    }
    this.#report(run, 'Nothing was picked in time. Start again.');
    return false;
  }

  async #items(sessionId) {
    let items = [];
    let pageToken;
    do {
      const query = new URLSearchParams({ sessionId, pageSize: 100, ...(pageToken && { pageToken }) });
      const page = await fetchJson(`${API}/mediaItems?${query}`, { headers: await this.#headers() });
      items = [...items, ...(page.mediaItems ?? [])];
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items.filter((item) => item.type === 'PHOTO');
  }

  async #save(item) {
    const path = join(this.dir, fileName(item.id));
    if (await exists(path)) return;
    const { baseUrl } = item.mediaFile;
    // The request carries a Google token, so it may only go to Google.
    if (!/^https:\/\/[\w-]+\.googleusercontent\.com\//.test(baseUrl)) throw new Error('Unexpected photo address');
    const res = await fetchOk(`${baseUrl}=w1600-h1600`, { headers: await this.#headers() });
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).rotate().jpeg({ quality: 88 }).toBuffer();
    await writeFile(`${path}.tmp`, jpeg);
    await rename(`${path}.tmp`, path);
  }

  async #download(items, replace, run) {
    await mkdir(this.dir, { recursive: true });
    let failed = 0;
    for (let i = 0; i < items.length; i += PARALLEL) {
      this.#report(run, `Copying photos: ${i} of ${items.length}.`);
      const results = await Promise.allSettled(items.slice(i, i + PARALLEL).map((item) => this.#save(item)));
      const errors = results.filter((r) => r.status === 'rejected');
      errors.forEach((r) => this.log('photo:', r.reason.message));
      failed += errors.length;
    }
    const done = `${items.length - failed} photos ready${failed ? `, ${failed} failed (see the log)` : ''}.`;
    if (!replace) return done;
    if (failed || !items.length) return `${done} Old photos were kept.`;
    const keep = new Set(items.map((item) => fileName(item.id)));
    const old = (await readdir(this.dir)).filter((name) => /^[0-9a-f]{24}\.jpg$/.test(name) && !keep.has(name));
    await Promise.all(old.map((name) => rm(join(this.dir, name))));
    return `${done} ${old.length} old photos removed.`;
  }
}
