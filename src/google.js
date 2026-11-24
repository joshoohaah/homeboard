import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fetchJson } from './http.js';

const API = 'https://www.googleapis.com/calendar/v3';
// The colon keeps it apart from calendar accounts, whose names cannot contain one.
export const PHOTOS_ACCOUNT = 'photos:picker';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const STATE_TTL_MS = 10 * 60_000;
const EVENT_COLORS = {
  1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e',
  7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000',
};

export function normalizeGoogle(item, labels = new Map()) {
  if (item.status === 'cancelled' || item.eventType === 'workingLocation' || !item.start) return null;
  if (item.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null;
  // Labels carry the color Google's own apps show; colorId is the older field.
  const color = labels.get(item.eventLabelId) ?? EVENT_COLORS[item.colorId];
  return {
    title: item.summary || 'Busy', allDay: Boolean(item.start.date),
    start: item.start.date ?? new Date(item.start.dateTime).toISOString(),
    end: item.end.date ?? new Date(item.end.dateTime).toISOString(),
    ...(color && { color }),
  };
}

export class GoogleClient {
  #access = new Map();
  #states = new Map();

  constructor({ clientId, clientSecret, publicUrl, dataDir }) {
    Object.assign(this, { clientId, clientSecret, dataDir });
    this.redirectUri = `${publicUrl}/admin/oauth/callback`;
    this.file = join(dataDir, 'google-tokens.json');
  }

  get configured() { return Boolean(this.clientId && this.clientSecret); }

  async tokens() {
    try { return JSON.parse(await readFile(this.file, 'utf8')); } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  }

  authUrl(account) {
    const state = randomBytes(24).toString('base64url');
    this.#states.set(state, { account, expires: Date.now() + STATE_TTL_MS });
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: this.clientId, redirect_uri: this.redirectUri, response_type: 'code',
      scope: account === PHOTOS_ACCOUNT ? PHOTOS_SCOPE : CALENDAR_SCOPE, access_type: 'offline', prompt: 'consent select_account', state,
    })}`;
  }

  async finish(code, state) {
    const pending = this.#states.get(state);
    this.#states.delete(state);
    if (!pending || pending.expires < Date.now()) throw new Error('Sign-in expired, start again');
    const token = await this.#tokenRequest({ code, redirect_uri: this.redirectUri, grant_type: 'authorization_code' });
    if (!token.refresh_token) throw new Error('Google returned no refresh token');
    const all = { ...(await this.tokens()), [pending.account]: token.refresh_token };
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(all), { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    this.#access.delete(pending.account);
    return pending.account;
  }

  #tokenRequest(fields) {
    return fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...fields }),
    });
  }

  async accessToken(account) {
    const cached = this.#access.get(account);
    if (cached?.expires > Date.now()) return cached.value;
    const refresh = (await this.tokens())[account];
    if (!refresh) throw new Error(`Google account "${account}" is not connected`);
    const t = await this.#tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' });
    this.#access.set(account, { value: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 });
    return t.access_token;
  }

  async #list(account, path, params) {
    const headers = { authorization: `Bearer ${await this.accessToken(account)}` };
    let items = [];
    let pageToken;
    do {
      const query = new URLSearchParams({ ...params, ...(pageToken && { pageToken }) });
      const page = await fetchJson(`${API}${path}?${query}`, { headers });
      items = [...items, ...(page.items ?? [])];
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  calendars(account) { return this.#list(account, '/users/me/calendarList', { maxResults: 250, showHidden: true }); }

  async #labels(account, id) {
    try {
      const headers = { authorization: `Bearer ${await this.accessToken(account)}` };
      const cal = await fetchJson(`${API}/calendars/${encodeURIComponent(id)}`, { headers });
      return new Map((cal.labelProperties?.eventLabels ?? [])
        .filter((l) => /^#[0-9a-f]{6}$/i.test(l.backgroundColor ?? ''))
        .map((l) => [l.id, l.backgroundColor]));
    } catch (err) {
      console.warn(`event label colors unavailable: ${err.message}`); // events still show, in the calendar color
      return new Map();
    }
  }

  /** `wanted` may be a calendar ID or the name shown in Google Calendar. */
  async events(account, wanted, range) {
    const list = await this.calendars(account);
    const cal = list.find((c) => c.id === wanted)
      ?? list.find((c) => c.summaryOverride === wanted || c.summary === wanted);
    if (!cal) throw new Error(`No calendar "${wanted}" in account "${account}"`);
    const items = await this.#list(account, `/calendars/${encodeURIComponent(cal.id)}/events`, {
      singleEvents: true, orderBy: 'startTime', maxResults: 2500,
      timeMin: range.start.toISOString(), timeMax: range.end.toISOString(),
    });
    const labels = items.some((i) => i.eventLabelId) ? await this.#labels(account, cal.id) : new Map();
    return items.map((item) => normalizeGoogle(item, labels)).filter(Boolean);
  }
}
