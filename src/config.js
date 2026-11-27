import { readFile } from 'node:fs/promises';

const SOURCE_TYPES = new Set(['google', 'ics', 'static']);
export const PRESETS = ['left', 'right', 'top', 'calendar'];
export const WIDGETS = ['clock', 'weather', 'aqi', 'forecast', 'word', 'quote', 'joke', 'photos', 'custom'];
const DEFAULT_LAYOUT = { preset: 'left', legend: true, widgets: ['clock', 'weather', 'aqi', 'forecast', 'word', 'photos'] };
const DEFAULTS = {
  title: 'Homeboard', weeks: 3, weekStart: 'monday', timeFormat: 'short',
  refreshMinutes: 5, photoSeconds: 30, colorRules: [], shorten: [],
};
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_RULE_LENGTH = 200;
const MAX_NAME_LENGTH = 60;

function fail(message) { throw new Error(`config.json: ${message}`); }

function checkCalendar(cal, i) {
  const where = `calendars[${i}]`;
  if (typeof cal.name !== 'string' || !cal.name.trim() || cal.name.length > MAX_NAME_LENGTH) fail(`${where} needs a name of up to ${MAX_NAME_LENGTH} characters`);
  if (!SOURCE_TYPES.has(cal.type)) fail(`${where} type must be google, ics or static`);
  if (cal.type === 'google' && (!/^[\w-]+$/.test(cal.account ?? '') || !cal.calendar)) fail(`${where} needs account and calendar`);
  if (cal.type === 'ics' && (!/^(https?|webcal):\/\//.test(cal.url ?? '') || !URL.canParse(cal.url))) fail(`${where} needs an http(s) or webcal url`);
  if (!HEX.test(cal.color ?? '')) fail(`${where} color must look like #aabbcc`);
  if (cal.icon && !/^[a-z0-9-]+$/.test(cal.icon)) fail(`${where} icon must be an MDI icon name`);
}

function checkLayout(layout) {
  if (!PRESETS.includes(layout.preset)) fail(`layout.preset must be one of ${PRESETS.join(', ')}`);
  if (typeof layout.legend !== 'boolean') fail('layout.legend must be true or false');
  const { widgets } = layout;
  if (!Array.isArray(widgets) || widgets.some((w) => !WIDGETS.includes(w)) || new Set(widgets).size !== widgets.length) {
    fail(`layout.widgets must list each of ${WIDGETS.join(', ')} at most once`);
  }
}

function checkShorten(rule, i) {
  const where = `shorten[${i}]`;
  if (typeof rule.match !== 'string' || !rule.match || rule.match.length > MAX_RULE_LENGTH) fail(`${where} needs a match of 1-${MAX_RULE_LENGTH} characters`);
  if (typeof rule.replace !== 'string' || rule.replace.length > MAX_RULE_LENGTH) fail(`${where} replace must be text`);
  if (rule.regex) {
    try { new RegExp(rule.match, 'gi'); } catch (err) { fail(`${where} is not a valid pattern: ${err.message}`); }
    // A repeated group that itself repeats, like (\w+)+, can take minutes on one title.
    if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(rule.match)) fail(`${where}: a repeated group inside a repeat can freeze the board; simplify the pattern`);
  }
}

export function validateConfig(raw) {
  const config = { ...DEFAULTS, ...raw, layout: { ...DEFAULT_LAYOUT, ...raw.layout } };
  if (!Array.isArray(config.calendars)) fail('calendars must be a list');
  config.calendars.forEach(checkCalendar);
  // Names key the cache, so a duplicate would show one calendar's events twice.
  if (new Set(config.calendars.map((c) => c.name)).size !== config.calendars.length) fail('calendar names must be unique');
  if (!Number.isInteger(config.weeks) || config.weeks < 1 || config.weeks > 6) fail('weeks must be 1-6');
  if (!['monday', 'sunday'].includes(config.weekStart)) fail('weekStart must be monday or sunday');
  if (!['short', 'long'].includes(config.timeFormat)) fail('timeFormat must be short or long');
  for (const key of ['refreshMinutes', 'photoSeconds']) {
    if (!(config[key] >= 1)) fail(`${key} must be at least 1`);
  }
  const { latitude, longitude } = config.location ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) fail('location needs latitude and longitude');
  for (const r of config.colorRules) {
    if (typeof r.match !== 'string' || !r.match || !HEX.test(r.color ?? '')) fail('each colorRule needs match and color');
  }
  checkLayout(config.layout);
  if (!Array.isArray(config.shorten)) fail('shorten must be a list');
  config.shorten.forEach(checkShorten);
  return config;
}

export async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, 'utf8')));
}
