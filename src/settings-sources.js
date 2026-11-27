import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ZONES = [...Intl.supportedValuesOf('timeZone'), 'UTC'];
const canonical = (zone) => ZONES.find((z) => z.toLowerCase() === zone.trim().toLowerCase()) ?? zone.trim();

// Settings can come from four layers, lowest first: built-in defaults, the admin page (data/config.json),
// CONFIG_FILE, and HOMEBOARD_* variables. The last two are "compose" and lock what they set.

const fail = (message) => { throw new Error(`Settings: ${message}`); };
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_GROUPS = { daily: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Objects merge key by key; anything else (including lists) replaces. */
export function deepMerge(base, top) {
  if (!isObject(base) || !isObject(top)) return top === undefined ? base : top;
  return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(top)])]
    .map((k) => [k, k in top ? deepMerge(base[k], top[k]) : base[k]]));
}

/** Dotted paths of every value set in a layer; lists count as one value. */
export function leafPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (isObject(v) ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  return { ...obj, [head]: rest.length ? setPath(isObject(obj[head]) ? obj[head] : {}, rest.join('.'), value) : value };
}
export function deletePath(obj, path) {
  const [head, ...rest] = path.split('.');
  if (!isObject(obj) || !(head in obj)) return obj;
  if (!rest.length) return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== head));
  return { ...obj, [head]: deletePath(obj[head], rest.join('.')) };
}

// ---- secrets ----

/** A secret from NAME or from the file named by NAME_FILE (Docker secrets), never both. */
export function readSecret(env, name) {
  const file = env[`${name}_FILE`];
  if (file && env[name]) fail(`set ${name} or ${name}_FILE, not both`);
  if (!file) return env[name];
  let value;
  try { value = readFileSync(file, 'utf8').trim(); } catch (err) {
    return fail(`${name}_FILE could not be read (${err.code ?? err.message})`);
  }
  return value || fail(`${name}_FILE (${file}) is empty`);
}

/** The environment with every supported secret resolved from its _FILE. */
export function resolveSecrets(env) {
  const names = ['ADMIN_PASSWORD', 'DISPLAY_KEY', 'GOOGLE_CLIENT_SECRET'];
  return { ...env, ...Object.fromEntries(names.map((n) => [n, readSecret(env, n)]).filter(([, v]) => v !== undefined)) };
}

// ---- HOMEBOARD_* variables ----

function number(name, text) {
  const n = Number(text);
  return Number.isFinite(n) && text.trim() !== '' ? n : fail(`${name} must be a number, got "${text}"`);
}
function bool(name, text) {
  const t = text.trim().toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(t)) return true;
  if (['false', 'no', 'off', '0'].includes(t)) return false;
  return fail(`${name} must be true or false, got "${text}"`);
}
const list = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

function days(name, text) {
  const t = text.trim().toLowerCase();
  if (DAY_GROUPS[t]) return DAY_GROUPS[t];
  return [...new Set(list(t).flatMap((part) => {
    const [a, b] = part.split('-').map((d) => DAY_NAMES.indexOf(d.slice(0, 3)));
    if (a < 0 || (part.includes('-') && b < 0)) return fail(`${name}: "${part}" is not a day or range like mon-fri`);
    if (b === undefined) return [a];
    return Array.from({ length: ((b - a + 7) % 7) + 1 }, (_, i) => (a + i) % 7); // sun-thu, fri-sun
  }))].sort();
}

/** "sun-thu 21:30-06:30; fri,sat 23:00-08:00" -> quiet windows. */
export function parseWindows(name, text) {
  return text.split(';').map((s) => s.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(.+?)\s+(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)$/);
    if (!m) return fail(`${name}: "${part}" should look like "mon-fri 21:30-06:30"`);
    const pad = (t) => t.padStart(5, '0');
    return { days: days(name, m[1]), start: pad(m[2]), end: pad(m[3]) };
  });
}

/** Variable -> [setting path, parser]. */
const VARIABLES = {
  HOMEBOARD_TITLE: ['title', (n, t) => t],
  HOMEBOARD_TIMEZONE: ['timeZone', (n, t) => canonical(t)],
  HOMEBOARD_LATITUDE: ['location.latitude', number],
  HOMEBOARD_LONGITUDE: ['location.longitude', number],
  HOMEBOARD_UNITS: ['location.units', (n, t) => t.trim().toLowerCase()],
  HOMEBOARD_WEEKS: ['weeks', number],
  HOMEBOARD_WEEK_START: ['weekStart', (n, t) => t.trim().toLowerCase()],
  HOMEBOARD_TIME_FORMAT: ['timeFormat', (n, t) => t.trim().toLowerCase()],
  HOMEBOARD_REFRESH_MINUTES: ['refreshMinutes', number],
  HOMEBOARD_PHOTO_SECONDS: ['photoSeconds', number],
  HOMEBOARD_LAYOUT: ['layout.preset', (n, t) => t.trim().toLowerCase()],
  HOMEBOARD_WIDGETS: ['layout.widgets', (n, t) => list(t.toLowerCase())],
  HOMEBOARD_LEGEND: ['layout.legend', bool],
  HOMEBOARD_QUIET: ['night.enabled', bool],
  HOMEBOARD_QUIET_WINDOWS: ['night.windows', parseWindows],
  HOMEBOARD_QUIET_SHOW: ['night.show', (n, t) => list(t.toLowerCase())],
  HOMEBOARD_QUIET_BRIGHTNESS: ['night.brightness', number],
  HOMEBOARD_ALERTS_DELAY_MINUTES: ['alerts.delayMinutes', number],
};
export const VARIABLE_NAMES = [...Object.keys(VARIABLES), 'HOMEBOARD_ALERTS_WEBHOOK'];

/** @returns {{ settings: object, sources: Record<string, string> }} sources maps setting path -> variable */
export function readVariables(env) {
  const known = new Set([...VARIABLE_NAMES, 'HOMEBOARD_ALERTS_WEBHOOK_FILE', 'HOMEBOARD_COMMIT']);
  const unknown = Object.keys(env).filter((k) => k.startsWith('HOMEBOARD_') && !known.has(k));
  if (unknown.length) fail(`unknown variable ${unknown.join(', ')}; see docs/DEPLOY.md for the list`);
  const entries = Object.entries(VARIABLES).filter(([name]) => env[name] !== undefined && env[name] !== '')
    .map(([name, [path, parse]]) => [name, path, parse(name, env[name])]);
  const webhook = readSecret(env, 'HOMEBOARD_ALERTS_WEBHOOK');
  if (webhook) entries.push(['HOMEBOARD_ALERTS_WEBHOOK', 'alerts.webhook', webhook.trim()]);
  return {
    settings: entries.reduce((obj, [, path, value]) => setPath(obj, path, value), {}),
    sources: Object.fromEntries(entries.map(([name, path]) => [path, name])),
  };
}

// ---- the config file ----

/** Reads CONFIG_FILE as YAML (.yaml, .yml) or JSON. Missing is an error: compose asked for it. */
export function readConfigFile(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (err) {
    return fail(`CONFIG_FILE ${path} could not be read (${err.code ?? err.message})`);
  }
  let data;
  try {
    data = /\.ya?ml$/i.test(path) ? parseYaml(text) : JSON.parse(text);
  } catch (err) {
    // YAML's first line names a line and column; JSON's quotes the text, which may hold a secret.
    const where = /\.ya?ml$/i.test(path) ? `YAML: ${err.message.split('\n')[0]}` : 'JSON';
    return fail(`CONFIG_FILE ${path} is not valid ${where}`);
  }
  if (data == null) return {};
  return isObject(data) ? data : fail(`CONFIG_FILE ${path} must contain settings (a mapping), not a list or text`);
}

/** The compose layer: file, then variables on top, and which variable or file set each path. */
export function readCompose(env, adminFile) {
  const file = env.CONFIG_FILE && resolve(env.CONFIG_FILE) !== resolve(adminFile) ? env.CONFIG_FILE : null;
  const fromFile = file ? readConfigFile(file) : {};
  const vars = readVariables(env);
  const sources = {
    ...Object.fromEntries(leafPaths(fromFile).map((p) => [p, file])),
    ...vars.sources,
  };
  return { settings: deepMerge(fromFile, vars.settings), sources, file };
}
