import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readVariables, resolveSecrets, readConfigFile, parseWindows, readCompose } from '../src/settings-sources.js';
import { loadSettings } from '../src/config.js';
import { ConfigStore } from '../src/config-edit.js';
import { adminHtml } from '../src/admin.js';

const folder = () => mkdtemp(join(tmpdir(), 'hb-compose-'));
const CAL = { name: 'Team', type: 'ics', url: 'https://x.test/t.ics', color: '#123456' };

test('variables set the simple settings and say where each came from', () => {
  const { settings, sources } = readVariables({
    HOMEBOARD_TIMEZONE: 'America/Chicago', HOMEBOARD_LATITUDE: '40.7', HOMEBOARD_LONGITUDE: '-74', HOMEBOARD_UNITS: 'celsius',
    HOMEBOARD_WEEKS: '3', HOMEBOARD_WEEK_START: 'Monday', HOMEBOARD_LAYOUT: 'TOP', HOMEBOARD_WIDGETS: 'clock, weather,quote',
    HOMEBOARD_LEGEND: 'no', HOMEBOARD_QUIET: 'yes', HOMEBOARD_QUIET_WINDOWS: 'sun-thu 21:30-06:30; fri,sat 23:00-8:00',
    HOMEBOARD_QUIET_SHOW: 'clock,next', HOMEBOARD_QUIET_BRIGHTNESS: '30', HOMEBOARD_ALERTS_WEBHOOK: 'http://ha.test/api/webhook/x',
    HOMEBOARD_TITLE: '', HOMEBOARD_COMMIT: 'abc', PATH: '/bin',
  });
  assert.deepEqual(settings, {
    timeZone: 'America/Chicago', location: { latitude: 40.7, longitude: -74, units: 'celsius' }, weeks: 3, weekStart: 'monday',
    layout: { preset: 'top', widgets: ['clock', 'weather', 'quote'], legend: false },
    night: { enabled: true, windows: [{ days: [0, 1, 2, 3, 4], start: '21:30', end: '06:30' }, { days: [5, 6], start: '23:00', end: '08:00' }], show: ['clock', 'next'], brightness: 30 },
    alerts: { webhook: 'http://ha.test/api/webhook/x' },
  });
  assert.equal(sources['night.windows'], 'HOMEBOARD_QUIET_WINDOWS');
  assert.equal('title' in settings, false, 'an empty variable is ignored');
});
test('quiet windows accept ranges that wrap and day groups', () => {
  assert.deepEqual(parseWindows('X', 'fri-sun 1:00-2:00').map((w) => w.days), [[0, 5, 6]]);
  assert.deepEqual(parseWindows('X', 'weekends 09:00-10:00; weekdays 20:00-07:00').map((w) => w.days), [[0, 6], [1, 2, 3, 4, 5]]);
  assert.throws(() => parseWindows('HOMEBOARD_QUIET_WINDOWS', 'funday 1:00-2:00'), /HOMEBOARD_QUIET_WINDOWS: "funday"/);
  assert.throws(() => parseWindows('HOMEBOARD_QUIET_WINDOWS', 'mon 9pm'), /should look like/);
});
test('bad or unknown variables stop with the variable named', () => {
  assert.throws(() => readVariables({ HOMEBOARD_WEEKS: 'three' }), /HOMEBOARD_WEEKS must be a number/);
  assert.throws(() => readVariables({ HOMEBOARD_LEGEND: 'maybe' }), /HOMEBOARD_LEGEND must be true or false/);
  assert.throws(() => readVariables({ HOMEBOARD_WEEK: '3' }), /unknown variable HOMEBOARD_WEEK\b/);
});
test('secrets come from _FILE, never both, and their values are never printed', async () => {
  const dir = await folder();
  await writeFile(join(dir, 'pw'), 's3cret-value\n');
  assert.equal(resolveSecrets({ ADMIN_PASSWORD_FILE: join(dir, 'pw') }).ADMIN_PASSWORD, 's3cret-value');
  assert.equal(readVariables({ HOMEBOARD_ALERTS_WEBHOOK_FILE: join(dir, 'pw') }).settings.alerts.webhook, 's3cret-value');
  assert.throws(() => resolveSecrets({ DISPLAY_KEY: 'a', DISPLAY_KEY_FILE: join(dir, 'pw') }), /DISPLAY_KEY or DISPLAY_KEY_FILE, not both/);
  assert.throws(() => resolveSecrets({ GOOGLE_CLIENT_SECRET_FILE: join(dir, 'missing') }), /GOOGLE_CLIENT_SECRET_FILE could not be read \(ENOENT\)/);
  await writeFile(join(dir, 'bad.json'), '{"alerts": {"webhook": "http://x/very-secret-id"');
  assert.throws(() => readConfigFile(join(dir, 'bad.json')), (err) => /not valid JSON/.test(err.message) && !err.message.includes('very-secret'));
});
test('the config file can be YAML or JSON; lists, text and missing files are refused', async () => {
  const dir = await folder();
  await writeFile(join(dir, 'a.yaml'), '# comments are fine\nweeks: 2\ncalendars:\n  - { name: Team, type: ics, url: "https://x.test/t.ics", color: "#123456" }\n');
  await writeFile(join(dir, 'b.json'), '{"weeks": 4}');
  await writeFile(join(dir, 'c.yml'), '- a\n- b\n');
  await writeFile(join(dir, 'd.yaml'), 'weeks: [1\n');
  await writeFile(join(dir, 'e.yaml'), '');
  assert.equal(readConfigFile(join(dir, 'a.yaml')).calendars[0].name, 'Team');
  assert.equal(readConfigFile(join(dir, 'b.json')).weeks, 4);
  assert.deepEqual(readConfigFile(join(dir, 'e.yaml')), {});
  assert.throws(() => readConfigFile(join(dir, 'c.yml')), /must contain settings/);
  assert.throws(() => readConfigFile(join(dir, 'd.yaml')), /not valid YAML: .*line/);
  assert.throws(() => readConfigFile(join(dir, 'nope.yaml')), /could not be read \(ENOENT\)/);
});

async function setup({ admin = {}, file, env = {} } = {}) {
  const dir = await folder();
  const adminFile = join(dir, 'config.json');
  await writeFile(adminFile, JSON.stringify({ location: { latitude: 1, longitude: 2 }, calendars: [CAL], ...admin }));
  if (file) await writeFile(join(dir, 'homeboard.yaml'), file);
  const fullEnv = { ...(file && { CONFIG_FILE: join(dir, 'homeboard.yaml') }), ...env };
  return { dir, adminFile, env: fullEnv, ...(await loadSettings(adminFile, fullEnv)) };
}

test('precedence: variables beat the file, the file beats the admin page, which beats defaults', async () => {
  const { config, compose } = await setup({ admin: { weeks: 1, weekStart: 'sunday', timeFormat: 'long' }, file: 'weeks: 2\nweekStart: monday\n', env: { HOMEBOARD_WEEKS: '5' } });
  assert.deepEqual([config.weeks, config.weekStart, config.timeFormat, config.refreshMinutes], [5, 'monday', 'long', 5]);
  assert.deepEqual(compose.sources, { weeks: 'HOMEBOARD_WEEKS', weekStart: compose.file });
});
test('without compose nothing changes; CONFIG_FILE naming the admin file is not compose', async () => {
  const plain = await setup({ admin: { weeks: 2 } });
  assert.deepEqual([plain.config.weeks, plain.compose.sources, plain.compose.file], [2, {}, null]);
  const same = await loadSettings(plain.adminFile, { CONFIG_FILE: plain.adminFile });
  assert.deepEqual(same.compose.sources, {});
});
test('compose alone is enough: no admin file at all', async () => {
  const dir = await folder();
  await writeFile(join(dir, 'h.yaml'), 'location: { latitude: 1, longitude: 2 }\ncalendars: []\n');
  const { config } = await loadSettings(join(dir, 'config.json'), { CONFIG_FILE: join(dir, 'h.yaml') });
  assert.equal(config.weeks, 3);
});

function store(s) {
  const board = { config: s.config, setConfig(c) { this.config = c; } };
  return { board, store: new ConfigStore({ board, file: s.adminFile, iconExists: async () => true, compose: s.compose, admin: s.admin }) };
}
const layout = (over) => ({ preset: 'left', weeks: '1', weekStart: 'sunday', timeFormat: 'long', timeZone: 'UTC', legend: 'on', ...over });

test('saving keeps compose values, saves the rest, and never writes compose values to the admin file', async () => {
  const s = await setup({ file: 'weeks: 2\n', env: { HOMEBOARD_TIMEZONE: 'America/Chicago' } });
  const { board, store: st } = store(s);
  await st.apply('layout', layout({ weeks: undefined, timeZone: undefined }));
  assert.deepEqual([board.config.weeks, board.config.timeZone, board.config.weekStart, board.config.timeFormat], [2, 'America/Chicago', 'sunday', 'long']);
  const saved = JSON.parse(await readFile(s.adminFile, 'utf8'));
  assert.deepEqual([saved.weeks, saved.timeZone, saved.weekStart], [undefined, undefined, 'sunday']);
  await st.apply('layout', layout({ weeks: '6', timeZone: 'Europe/Paris' }));
  assert.deepEqual([board.config.weeks, board.config.timeZone], [2, 'America/Chicago'], 'a forged form cannot change them');
  const later = await loadSettings(s.adminFile, {});
  assert.deepEqual([later.config.weeks, later.config.weekStart], [3, 'sunday'], 'removing compose brings back saved or default values');
});
test('calendars and shortening rules lock as a whole when the file defines them', async () => {
  const s = await setup({ file: `calendars:\n  - { name: Team, type: ics, url: "https://x.test/t.ics", color: "#123456" }\nshorten: []\n` });
  const { store: st } = store(s);
  await assert.rejects(st.apply('add-ics', { name: 'B', color: '#000000', url: 'https://y.test/b.ics' }), /Calendars are set in compose/);
  await assert.rejects(st.apply('shorten-add', { match: 'a', replace: '' }), /Shortening rules are set in compose/);
});
test('the admin page marks locked settings and lists where settings come from', async () => {
  const s = await setup({ file: `calendars:\n  - { name: Team, type: ics, url: "https://x.test/secret-path.ics", color: "#123456" }\n`, env: { HOMEBOARD_WEEKS: '2', HOMEBOARD_ALERTS_WEBHOOK: 'http://ha.test/api/webhook/hidden-id' } });
  const board = { config: s.config, titles: () => [], status: () => [] };
  const google = { configured: false, tokens: async () => ({}) };
  const html = await adminHtml({ board, google, photoImport: { status: '' }, custom: { css: '', html: '' }, version: { version: 't' }, token: 'k', compose: s.compose });
  assert.match(html, /name="weeks"[^>]*disabled title="Set in compose by HOMEBOARD_WEEKS"/);
  assert.match(html, /name="webhook"[^>]*disabled/);
  assert.doesNotMatch(html, /name="preset"[^>]*disabled/);
  assert.doesNotMatch(html, /value="add-ics"|value="remove"/, 'no calendar editing');
  assert.match(html, /<code>calendars<\/code><\/td><td>[^<]*homeboard\.yaml/);
  assert.doesNotMatch(html, /hidden-id|secret-path/, 'values are not shown');
});
test('readCompose ignores a missing CONFIG_FILE variable', () => {
  assert.deepEqual(readCompose({}, 'x/config.json'), { settings: {}, sources: {}, file: null });
});

test('a saved value hidden by compose survives saves and returns when compose drops it', async () => {
  const s = await setup({ admin: { weeks: 1, calendars: [] }, file: 'weeks: 2\ncalendars: []\n' });
  const { store: st } = store(s);
  await st.apply('layout', layout({ weeks: undefined }));
  const saved = JSON.parse(await readFile(s.adminFile, 'utf8'));
  assert.deepEqual([saved.weeks, saved.calendars], [1, []]);
  const later = await loadSettings(s.adminFile, {});
  assert.equal(later.config.weeks, 1);
});
test('a fresh install with variables only starts, with no calendars yet', async () => {
  const dir = await folder();
  const { config } = await loadSettings(join(dir, 'config.json'), { HOMEBOARD_LATITUDE: '1', HOMEBOARD_LONGITUDE: '2' });
  assert.deepEqual(config.calendars, []);
});
test('errors from validation name the variable or file that set the value', async () => {
  const dir = await folder();
  const adminFile = join(dir, 'config.json');
  const env = { HOMEBOARD_LATITUDE: '1', HOMEBOARD_LONGITUDE: '2' };
  await assert.rejects(loadSettings(adminFile, { ...env, HOMEBOARD_LAYOUT: 'middle' }), /layout\.preset must be .*\(set by HOMEBOARD_LAYOUT\)/);
  await assert.rejects(loadSettings(adminFile, { ...env, HOMEBOARD_UNITS: 'kelvin' }), /location\.units .*\(set by HOMEBOARD_UNITS\)/);
  await assert.rejects(loadSettings(adminFile, { HOMEBOARD_LATITUDE: '1' }), /location needs .*\(set by HOMEBOARD_LATITUDE\)/);
  await writeFile(join(dir, 'h.yaml'), 'night: { windows: [{ days: [], start: "1:00", end: "2:00" }] }\n');
  await assert.rejects(loadSettings(adminFile, { ...env, CONFIG_FILE: join(dir, 'h.yaml') }), /night\.windows: .*\(set by .*h\.yaml\)/);
  await writeFile(adminFile, '{"weeks": 9}');
  await assert.rejects(loadSettings(adminFile, env), /weeks must be 1-6 \(set by data\/config\.json/);
});
test('renaming a calendar that locked rules refer to is refused', async () => {
  const s = await setup({ file: 'shorten:\n  - { match: a, replace: b, calendar: Team }\n' });
  const { store: st } = store(s);
  await assert.rejects(st.apply('update', { was: 'Team', name: 'Squad', color: '#123456' }), /rename it there too/);
  await st.apply('update', { was: 'Team', name: 'Team', color: '#654321' });
});
test('variables: zone names in any case, unknown _FILE names and empty secret files', async () => {
  assert.equal(readVariables({ HOMEBOARD_TIMEZONE: 'america/chicago' }).settings.timeZone, 'America/Chicago');
  assert.throws(() => readVariables({ HOMEBOARD_ALERT_WEBHOOK_FILE: '/x' }), /unknown variable HOMEBOARD_ALERT_WEBHOOK_FILE/);
  const dir = await folder();
  await writeFile(join(dir, 'empty'), '\n');
  assert.throws(() => resolveSecrets({ ADMIN_PASSWORD_FILE: join(dir, 'empty') }), /ADMIN_PASSWORD_FILE .* is empty/);
});
