import { rename, writeFile } from 'node:fs/promises';
import { validateConfig } from './config.js';

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
    if (!Object.hasOwn(EDITS, action)) throw new Error('Unknown action');
    if (fields.icon?.trim() && !(await this.iconExists(fields.icon.trim()))) throw new Error(`There is no icon called "${fields.icon.trim()}"`);
    const { config } = this.board;
    const next = validateConfig({ ...config, calendars: EDITS[action](config.calendars, fields) });
    const renamed = action === 'update' && fields.was !== fields.name?.trim();
    const withRules = renamed
      ? { ...next, colorRules: next.colorRules.map((r) => (r.calendar === fields.was ? { ...r, calendar: fields.name.trim() } : r)) }
      : next;
    await writeFile(`${this.file}.tmp`, `${JSON.stringify(withRules, null, 2)}\n`, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
    this.board.setConfig(withRules);
  }
}
