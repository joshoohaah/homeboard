import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWeeks, gridRange, addDays, ymd } from './grid.js';
import { fetchIcs } from './ics.js';
import { fetchWeather, fetchAqi, fetchWord } from './feeds.js';

const WARN_AFTER_MS = 60 * 60_000;

/** Fetches every source independently and keeps the last good copy of each, on disk. */
export class Board {
  #cache = {};
  #errors = {};
  #running = null;

  constructor({ config, google, photos, dataDir, log = console.error, now = () => new Date() }) {
    Object.assign(this, { config, google, photos, dataDir, log, now });
    this.file = join(dataDir, 'cache.json');
  }

  async load() {
    try { this.#cache = JSON.parse(await readFile(this.file, 'utf8')); } catch (err) {
      if (err.code !== 'ENOENT') this.log('cache unreadable, starting empty:', err.message);
    }
  }

  #jobs() {
    const { location, calendars, weeks } = this.config;
    const range = gridRange(this.now(), weeks);
    // One spare week so the grid is full right after Saturday midnight.
    const span = { start: range.start, end: addDays(range.end, 7) };
    const fetchers = {
      ics: (c) => fetchIcs(c.url, span),
      google: (c) => this.google.events(c.account, c.calendar, span),
      static: async (c) => c.events.map((e) => ({ ...e, ...staticDates(e, range.start) })),
    };
    return [
      ...calendars.map((c) => [`cal:${c.name}`, () => fetchers[c.type](c)]),
      ['weather', () => fetchWeather(location)],
      ['aqi', () => fetchAqi(location)],
      ['word', fetchWord],
      ['photos', () => this.photos.scan()],
    ];
  }

  /** Swaps the config and forgets cached events whose source changed. */
  setConfig(config) {
    const source = (c) => JSON.stringify([c.type, c.account, c.calendar, c.url]);
    const before = new Map(this.config.calendars.map((c) => [c.name, source(c)]));
    const kept = new Set(config.calendars.filter((c) => before.get(c.name) === source(c)).map((c) => `cal:${c.name}`));
    const keep = (all) => Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('cal:') || kept.has(k)));
    this.#cache = keep(this.#cache);
    this.#errors = keep(this.#errors);
    this.config = config;
  }

  /** Refreshes after any refresh that is already running, so new settings are picked up. */
  refreshSoon() {
    const running = this.#running ?? Promise.resolve();
    running.catch(() => {}).then(() => this.refresh()).catch((err) => this.log('refresh:', err.message));
  }

  refresh() {
    this.#running ??= this.#refresh().finally(() => { this.#running = null; });
    return this.#running;
  }

  async #refresh() {
    const { config } = this;
    const jobs = this.#jobs();
    const results = await Promise.allSettled(jobs.map(([, run]) => run()));
    results.forEach((r, i) => {
      const [key] = jobs[i];
      if (key.startsWith('cal:') && config !== this.config) return; // calendars changed meanwhile
      if (r.status === 'fulfilled') {
        this.#cache = { ...this.#cache, [key]: { at: Date.now(), data: r.value } };
        this.#errors = { ...this.#errors, [key]: null };
      } else {
        this.#errors = { ...this.#errors, [key]: r.reason.message };
        this.log(`${key}: ${r.reason.message}`);
      }
    });
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.#cache), { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
  }

  #data(key) { return this.#cache[key]?.data ?? null; }

  #events() {
    const rules = this.config.colorRules.map((r) => ({ ...r, needle: r.match.toLowerCase() }));
    return this.config.calendars.flatMap((c, order) => (this.#data(`cal:${c.name}`) ?? []).map((e) => {
      const rule = rules.find((r) => (!r.calendar || r.calendar === c.name) && e.title.toLowerCase().includes(r.needle));
      return { ...e, order, icon: c.icon, color: rule?.color ?? e.color ?? c.color };
    }));
  }

  status() {
    return this.#jobs().map(([key]) => ({ key, at: this.#cache[key]?.at ?? null, error: this.#errors[key] ?? null }));
  }

  /** What the browser gets. No URLs, tokens or account names. */
  snapshot() {
    const now = this.now();
    const weather = this.#data('weather');
    return {
      title: this.config.title, today: ymd(now),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      legend: this.config.calendars.map(({ name, color, icon }) => ({ name, color, icon: icon ?? null })),
      weeks: buildWeeks(this.#events(), now, this.config.weeks),
      weather: weather && { ...weather, days: weather.days.filter((d) => d.date >= ymd(now)).slice(0, 3) },
      aqi: this.#data('aqi'), word: this.#data('word'),
      photos: this.photos.ids(), photoSeconds: this.config.photoSeconds,
      problems: this.status()
        .filter((s) => s.error && (!s.at || Date.now() - s.at > WARN_AFTER_MS))
        .map((s) => s.key.replace(/^cal:/, '')),
    };
  }
}

/** Demo events: `day` counts from the first Sunday shown. */
function staticDates({ day, days = 1, time, hours = 1 }, first) {
  const date = addDays(first, day);
  if (!time) return { allDay: true, start: ymd(date), end: ymd(addDays(date, days)) };
  const [h, m] = time.split(':').map(Number);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  return { allDay: false, start: start.toISOString(), end: new Date(start.getTime() + hours * 3600_000).toISOString() };
}
