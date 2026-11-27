import { createHash } from 'node:crypto';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_CUSTOM_LENGTH = 50_000;
const FILES = { css: 'custom.css', html: 'custom.html' };
const RECHECK_MS = 15_000;

/**
 * The owner's custom.css and custom.html in the data folder; both optional.
 * Files edited or deleted outside the admin page are picked up within RECHECK_MS.
 */
export class CustomFiles {
  #text = { css: '', html: '' };
  #stamps = {};
  #checked = 0;

  constructor(dir, log = console.error) { Object.assign(this, { dir, log }); }

  async #read(kind) {
    const path = join(this.dir, FILES[kind]);
    try {
      const { mtimeMs, size } = await stat(path);
      const stamp = `${mtimeMs}:${size}`;
      if (this.#stamps[kind] === stamp) return;
      this.#text = { ...this.#text, [kind]: await readFile(path, 'utf8') };
      this.#stamps = { ...this.#stamps, [kind]: stamp };
    } catch (err) {
      // A missing or unreadable file means the default look; the board keeps running.
      if (err.code !== 'ENOENT') this.log(`${FILES[kind]} could not be read, ignoring it: ${err.message}`);
      this.#text = { ...this.#text, [kind]: '' };
      this.#stamps = { ...this.#stamps, [kind]: null };
    }
  }

  async load() {
    this.#checked = Date.now();
    await Promise.all(Object.keys(FILES).map((kind) => this.#read(kind)));
  }

  /** Cheap enough to call on every board poll. */
  async refresh() {
    if (Date.now() - this.#checked >= RECHECK_MS) await this.load();
  }

  get css() { return this.#text.css; }
  get html() { return this.#text.html; }

  /** Changes whenever either file changes, so the board knows to reload them. */
  get version() {
    return createHash('sha256').update(this.#text.css).update('\0').update(this.#text.html).digest('hex').slice(0, 12);
  }

  async save(kind, text) {
    if (!FILES[kind]) throw new Error('Unknown custom file');
    if (typeof text !== 'string') throw new Error('Nothing to save');
    const clean = text.replaceAll('\r\n', '\n');
    if (clean.length > MAX_CUSTOM_LENGTH) throw new Error(`Keep it under ${MAX_CUSTOM_LENGTH} characters`);
    const path = join(this.dir, FILES[kind]);
    await writeFile(`${path}.tmp`, clean, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    this.#text = { ...this.#text, [kind]: clean };
    this.#stamps = { ...this.#stamps, [kind]: undefined }; // re-stat next time
  }
}

// The custom HTML runs in a sandboxed frame with no script, no forms and no network except images and fonts.
export const CUSTOM_HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; frame-ancestors 'self'; sandbox";

export function customPage(html) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
body{margin:0;color:#fff;font:16px system-ui,sans-serif;background:transparent;overflow:hidden}
</style><body>${html}</body></html>`;
}
