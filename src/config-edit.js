import { rename, writeFile } from 'node:fs/promises';
import { validateConfig, WIDGETS } from './config.js';

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
    weeks: Number(f.weeks), weekStart: f.weekStart, timeFormat: f.timeFormat,
    layout: {
      preset: f.preset, legend: f.legend === 'on',
      widgets: WIDGETS.filter((w) => f[`show-${w}`] === 'on')
        .map((w, i) => [w, Number(f[`order-${w}`]) || i + 100])
        .toSorted((a, b) => a[1] - b[1]).map(([w]) => w),
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

/** Keeps config.json and the running board in step. */
export class ConfigStore {
  #queue = Promise.resolve();

  constructor({ board, file, iconExists }) { Object.assign(this, { board, file, iconExists }); }

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
    const next = validateConfig(isCalendar
      ? { ...config, calendars: EDITS[action](config.calendars, fields) }
      : SETTINGS[action](config, fields));
    const renamed = action === 'update' && fields.was !== fields.name?.trim();
    const follow = (rules) => rules.map((r) => (r.calendar === fields.was ? { ...r, calendar: fields.name.trim() } : r));
    const withRules = renamed ? { ...next, colorRules: follow(next.colorRules), shorten: follow(next.shorten) } : next;
    await writeFile(`${this.file}.tmp`, `${JSON.stringify(withRules, null, 2)}\n`, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    this.board.setConfig(withRules);
  }
}
