import { rename, writeFile } from 'node:fs/promises';
import { validateConfig, canonicalZone, WIDGETS, NIGHT_PARTS, WINDOW_ROWS } from './config.js';
import { deletePath, getPath, setPath } from './settings-sources.js';

const LIST_LOCKS = { calendars: 'Calendars', shorten: 'Shortening rules' };

const at = (list, name) => {
  const i = list.findIndex((c) => c.name === name);
  if (i < 0) throw new Error(`There is no calendar called "${name}"`);
  return i;
};
const look = ({ name, color, icon }) => ({ name: name?.trim(), color, ...(icon?.trim() && { icon: icon.trim() }) });

/** Pure edits: (calendars, form fields) -> new calendars. */
export const EDITS = {
  'add-google': (list, f) => [...list, { ...look(f), type: 'google', account: f.account, calendar: f.calendar }],
  'add-ics': (list, f) => [...list, { ...look(f), type: 'ics', url: f.url?.trim() }],
  update: (list, f) => {
    const { icon, ...old } = list[at(list, f.was)];
    return list.with(at(list, f.was), { ...old, ...look(f) });
  },
  remove: (list, f) => list.toSpliced(at(list, f.was), 1),
  up: (list, f) => {
    const i = at(list, f.was);
    return i === 0 ? list : list.with(i, list[i - 1]).with(i - 1, list[i]);
  },
};

/** Pure edits: (config, form fields) -> new config, for the board's own settings. */
export const SETTINGS = {
  layout: (config, f) => ({
    ...config,
    weeks: Number(f.weeks), weekStart: f.weekStart, timeFormat: f.timeFormat, timeZone: canonicalZone(f.timeZone),
    layout: {
      preset: f.preset, legend: f.legend === 'on',
      widgets: WIDGETS.filter((w) => f[`show-${w}`] === 'on')
        .map((w, i) => [w, Number(f[`order-${w}`]) || i + 100])
        .toSorted((a, b) => a[1] - b[1]).map(([w]) => w),
    },
  }),
  night: (config, f) => ({
    ...config,
    night: {
      enabled: f.enabled === 'on', mode: f.mode, brightness: Number(f.brightness),
      show: NIGHT_PARTS.filter((p) => f[`show-${p}`] === 'on'),
      windows: Array.from({ length: WINDOW_ROWS }, (_, i) => ({
        days: [0, 1, 2, 3, 4, 5, 6].filter((d) => f[`w${i}-d${d}`] === 'on'),
        start: f[`w${i}-start`] ?? '', end: f[`w${i}-end`] ?? '',
      })).filter((w) => w.start || w.end), // a row without times is unused
    },
  }),
  alerts: (config, f) => ({
    ...config,
    alerts: {
      webhook: f.clear === 'on' ? '' : f.webhook?.trim() || config.alerts.webhook,
      delayMinutes: Number(f.delayMinutes),
    },
  }),
  'shorten-add': (config, f) => ({
    ...config,
    shorten: [...config.shorten, {
      match: f.match ?? '', replace: f.replace ?? '',
      ...(f.regex === 'on' && { regex: true }), ...(f.calendar && { calendar: f.calendar }),
    }],
  }),
  'shorten-remove': (config, f) => {
    const i = Number(f.index);
    if (!Number.isInteger(i) || !config.shorten[i]) throw new Error('That rule no longer exists');
    return { ...config, shorten: config.shorten.toSpliced(i, 1) };
  },
};

/** Keeps data/config.json (the admin layer) and the running board in step. */
export class ConfigStore {
  #queue = Promise.resolve();

  constructor({ board, file, iconExists, onSaved, compose = { settings: {}, sources: {}, file: null }, admin }) {
    // `admin` is data/config.json as read; it keeps values compose currently overrides.
    Object.assign(this, { board, file, iconExists, onSaved, compose, admin: admin ?? {} });
  }

  /** Edits run one after another, so two saves cannot overwrite each other. */
  apply(action, fields) {
    const run = this.#queue.then(() => this.#apply(action, fields));
    this.#queue = run.catch(() => {}); // the caller gets the error from `run`
    return run;
  }

  async #apply(action, fields) {
    const isCalendar = Object.hasOwn(EDITS, action);
    if (!isCalendar && !Object.hasOwn(SETTINGS, action)) throw new Error('Unknown action');
    if (fields.icon?.trim() && !(await this.iconExists(fields.icon.trim()))) throw new Error(`There is no icon called "${fields.icon.trim()}"`);
    const { config } = this.board;
    const locks = Object.keys(this.compose.sources);
    const list = isCalendar ? 'calendars' : action.startsWith('shorten') ? 'shorten' : null;
    if (list && locks.includes(list)) throw new Error(`${LIST_LOCKS[list]} are set in compose (${this.compose.sources[list]})`);
    const edited = isCalendar
      ? { ...config, calendars: EDITS[action](config.calendars, fields) }
      : SETTINGS[action](config, fields);
    // Fields locked by compose are not sent by the form; their values always come from compose.
    const next = validateConfig(locks.reduce((c, p) => setPath(c, p, getPath(config, p)), edited));
    const renamed = action === 'update' && fields.was !== fields.name?.trim();
    const lockedRules = ['colorRules', 'shorten'].filter((k) => locks.includes(k) && config[k].some((r) => r.calendar === fields.was));
    if (renamed && lockedRules.length) {
      throw new Error(`Rules in compose (${this.compose.sources[lockedRules[0]]}) use the name "${fields.was}"; rename it there too, then here`);
    }
    const follow = (rules) => rules.map((r) => (r.calendar === fields.was ? { ...r, calendar: fields.name.trim() } : r));
    const withRules = renamed ? { ...next, colorRules: follow(next.colorRules), shorten: follow(next.shorten) } : next;
    // Locked paths keep what the admin file had, so removing them from compose brings those values back.
    const adminLayer = locks.reduce((layer, p) => {
      const kept = getPath(this.admin, p);
      return kept === undefined ? deletePath(layer, p) : setPath(layer, p, kept);
    }, withRules);
    await writeFile(`${this.file}.tmp`, `${JSON.stringify(adminLayer, null, 2)}\n`, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    this.admin = adminLayer;
    this.board.setConfig(withRules);
    this.onSaved?.(withRules);
  }
}
