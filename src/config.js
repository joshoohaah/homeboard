import { readFile } from 'node:fs/promises';

const SOURCE_TYPES = new Set(['google', 'ics', 'static']);
const DEFAULTS = { title: 'Homeboard', weeks: 6, refreshMinutes: 5, photoSeconds: 30, colorRules: [] };
const HEX = /^#[0-9a-f]{6}$/i;

function fail(message) { throw new Error(`config.json: ${message}`); }

function checkCalendar(cal, i) {
  const where = `calendars[${i}]`;
  if (!cal.name) fail(`${where} needs a name`);
  if (!SOURCE_TYPES.has(cal.type)) fail(`${where} type must be google, ics or static`);
  if (cal.type === 'google' && (!/^[\w-]+$/.test(cal.account ?? '') || !cal.calendar)) fail(`${where} needs account and calendar`);
  if (cal.type === 'ics' && !/^(https?|webcal):\/\//.test(cal.url ?? '')) fail(`${where} needs an http(s) or webcal url`);
  if (!HEX.test(cal.color ?? '')) fail(`${where} color must look like #aabbcc`);
  if (cal.icon && !/^[a-z0-9-]+$/.test(cal.icon)) fail(`${where} icon must be an MDI icon name`);
}

export function validateConfig(raw) {
  const config = { ...DEFAULTS, ...raw };
  if (!Array.isArray(config.calendars)) fail('calendars must be a list');
  config.calendars.forEach(checkCalendar);
  // Names key the cache, so a duplicate would show one calendar's events twice.
  if (new Set(config.calendars.map((c) => c.name)).size !== config.calendars.length) fail('calendar names must be unique');
  if (!Number.isInteger(config.weeks) || config.weeks < 1 || config.weeks > 12) fail('weeks must be 1-12');
  for (const key of ['refreshMinutes', 'photoSeconds']) {
    if (!(config[key] >= 1)) fail(`${key} must be at least 1`);
  }
  const { latitude, longitude } = config.location ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) fail('location needs latitude and longitude');
  for (const r of config.colorRules) {
    if (typeof r.match !== 'string' || !r.match || !HEX.test(r.color ?? '')) fail('each colorRule needs match and color');
  }
  return config;
}

export async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, 'utf8')));
}
