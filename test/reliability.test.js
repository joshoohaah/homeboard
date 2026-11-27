import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNight, nextEvent } from '../src/night.js';
import { Alerts, webhookSender } from '../src/alerts.js';
import { validateConfig } from '../src/config.js';
import { SETTINGS } from '../src/config-edit.js';
import { applyTimeZone } from '../src/timezone.js';
import { appVersion } from '../src/version.js';

const base = validateConfig({ location: { latitude: 1, longitude: 2 }, calendars: [] });
const night = (over) => ({ ...base.night, enabled: true, ...over });
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);
const SCHOOL = [{ days: [0, 1, 2, 3, 4], start: '21:30', end: '06:30' }, { days: [5, 6], start: '23:00', end: '08:00' }];

test('quiet windows: per day, past midnight, belonging to the day they start', () => {
  const n = night({ windows: SCHOOL });
  // Thursday 2026-12-03 and Friday 2026-12-04
  assert.equal(isNight(n, at(2026, 12, 3, 21, 29)), false);
  assert.equal(isNight(n, at(2026, 12, 3, 21, 30)), true);
  assert.equal(isNight(n, at(2026, 12, 4, 6, 29)), true, 'Thursday night runs into Friday morning');
  assert.equal(isNight(n, at(2026, 12, 4, 6, 30)), false);
  assert.equal(isNight(n, at(2026, 12, 4, 22, 0)), false, 'Friday uses the weekend window');
  assert.equal(isNight(n, at(2026, 12, 5, 7, 59)), true, 'Friday night runs into Saturday');
  assert.equal(isNight(n, at(2026, 12, 7, 7, 0)), false, 'Sunday night ended at 06:30 on Monday');
  assert.equal(isNight(night({ windows: [{ days: [1], start: '13:00', end: '14:00' }] }), at(2026, 12, 7, 13, 30)), true);
});
test('quiet mode: switched off, forced on and forced off', () => {
  assert.equal(isNight({ ...base.night, enabled: false }, at(2026, 12, 3, 23)), false);
  assert.equal(isNight(night({ mode: 'on' }), at(2026, 12, 3, 12)), true);
  assert.equal(isNight(night({ mode: 'off' }), at(2026, 12, 3, 23)), false);
});
test('quiet hours use wall-clock time on both DST change days', () => {
  const spring = night({ windows: [{ days: [0], start: '01:30', end: '03:30' }] });
  // 2026-03-08: 02:00 jumps to 03:00, so only 30 real minutes of this window remain after the jump.
  assert.equal(isNight(spring, new Date(Date.UTC(2026, 2, 8, 8, 15))), true, '03:15 CDT');
  assert.equal(isNight(spring, new Date(Date.UTC(2026, 2, 8, 8, 30))), false, '03:30 CDT');
  const fall = night({ windows: [{ days: [0], start: '01:00', end: '01:45' }] });
  // 2026-11-01: 01:30 happens twice; both are inside the window, 01:50 in neither.
  assert.equal(isNight(fall, new Date(Date.UTC(2026, 10, 1, 6, 30))), true, 'first 01:30 (CDT)');
  assert.equal(isNight(fall, new Date(Date.UTC(2026, 10, 1, 7, 30))), true, 'second 01:30 (CST)');
  assert.equal(isNight(fall, new Date(Date.UTC(2026, 10, 1, 7, 50))), false, '01:50 CST');
});
test('next event: the first timed event within a day', () => {
  const now = at(2026, 12, 3, 22);
  const ev = (title, h, d = 3, allDay = false) => ({ title, allDay, start: allDay ? '2026-12-04' : at(2026, 12, d, h).toISOString(), color: '#123456' });
  const next = nextEvent([ev('Late', 23), ev('Early', 7, 4), ev('Gone', 9), ev('All day', 0, 4, true)], now, 'short');
  assert.deepEqual(next, { title: 'Late', when: 'Today 11p', color: '#123456' });
  assert.equal(nextEvent([ev('Far', 23, 5)], now, 'short'), null);
});

test('alerts: once after the delay, once on recovery, nothing in between', async () => {
  let clock = 0;
  const sent = [];
  const alerts = new Alerts({ send: async (m) => { sent.push(m); }, now: () => clock });
  const down = [{ key: 'cal:Band', error: 'HTTP 401 from www.googleapis.com' }];
  await alerts.update(down, 60);
  clock = 59 * 60_000;
  await alerts.update(down, 60);
  assert.equal(sent.length, 0);
  clock = 60 * 60_000;
  await alerts.update(down, 60);
  clock = 120 * 60_000;
  await alerts.update(down, 60);
  await alerts.update([{ key: 'cal:Band', error: null }], 60);
  await alerts.update([{ key: 'cal:Band', error: null }], 60);
  assert.deepEqual(sent.map((m) => [m.event, m.source]), [['down', 'Band'], ['recovered', 'Band']]);
  assert.match(sent[0].message, /Band has been failing since .*HTTP 401/);
});
test('alerts: a short blip sends nothing, and a failed send is only logged', async () => {
  const logged = [];
  const alerts = new Alerts({ send: async () => { throw new Error('HA down'); }, log: (...a) => logged.push(a.join(' ')), now: () => 0 });
  await alerts.update([{ key: 'weather', error: 'x' }], 0);
  assert.match(logged[0], /HA down/);
  const quiet = [];
  const blip = new Alerts({ send: async (m) => { quiet.push(m); }, now: () => 0 });
  await blip.update([{ key: 'weather', error: 'x' }], 60);
  await blip.update([{ key: 'weather', error: null }], 60);
  assert.equal(quiet.length, 0);
});
test('webhook sender posts JSON and skips when no URL is set', async () => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, o) => { calls.push([url, o.method, JSON.parse(o.body)]); return new Response('', { status: 200 }); };
  try {
    await webhookSender(() => 'http://ha.test:8123/api/webhook/abc')({ event: 'test' });
    await webhookSender(() => '')({ event: 'test' });
  } finally { globalThis.fetch = real; }
  assert.deepEqual(calls, [['http://ha.test:8123/api/webhook/abc', 'POST', { event: 'test' }]]);
});

test('config: quiet mode, alerts and time zone are validated', () => {
  const ok = { location: { latitude: 1, longitude: 2 }, calendars: [] };
  assert.deepEqual([base.night.enabled, base.alerts.delayMinutes, base.timeZone], [false, 60, undefined]);
  for (const [over, error] of [
    [{ night: { windows: [{ days: [], start: '22:00', end: '06:00' }] } }, /days/],
    [{ night: { windows: [{ days: [1], start: '25:00', end: '06:00' }] } }, /times/],
    [{ night: { windows: [{ days: [1], start: '06:00', end: '06:00' }] } }, /different/],
    [{ night: { show: ['radio'] } }, /show/],
    [{ night: { brightness: 0 } }, /brightness/],
    [{ alerts: { webhook: 'ftp://x' } }, /webhook/],
    [{ alerts: { delayMinutes: 1 } }, /delayMinutes/],
    [{ timeZone: 'Mars/Olympus' }, /time zone/],
    [{ timeZone: 'america/chicago' }, /time zone/],
    [{ timeZone: '+05:00' }, /time zone/],
    [{ timeZone: 'EST' }, /time zone/],
  ]) assert.throws(() => validateConfig({ ...ok, ...over }), error, JSON.stringify(over));
  assert.equal(validateConfig({ ...ok, timeZone: 'Europe/Amsterdam' }).timeZone, 'Europe/Amsterdam');
});
test('admin edits: quiet windows from form rows, webhook kept unless replaced or cleared', () => {
  const f = { enabled: 'on', mode: 'auto', brightness: '30', 'show-clock': 'on', 'show-next': 'on',
    'w0-start': '21:30', 'w0-end': '06:30', 'w0-d1': 'on', 'w0-d2': 'on', 'w1-start': '', 'w1-end': '' };
  const n = validateConfig(SETTINGS.night(base, f)).night;
  assert.deepEqual(n, { enabled: true, mode: 'auto', brightness: 30, show: ['clock', 'next'], windows: [{ days: [1, 2], start: '21:30', end: '06:30' }] });
  const withHook = SETTINGS.alerts(base, { webhook: 'http://ha.test/api/webhook/x', delayMinutes: '30' });
  assert.equal(SETTINGS.alerts(withHook, { webhook: '', delayMinutes: '30' }).alerts.webhook, 'http://ha.test/api/webhook/x');
  assert.equal(SETTINGS.alerts(withHook, { webhook: '', clear: 'on', delayMinutes: '30' }).alerts.webhook, '');
});
test('the configured time zone drives local time', () => {
  const env = { TZ: 'America/Chicago' };
  applyTimeZone({ timeZone: 'Asia/Tokyo' }, env);
  assert.equal(env.TZ, 'Asia/Tokyo');
  applyTimeZone({}, env);
  assert.equal(env.TZ, 'Asia/Tokyo', 'no setting leaves the zone alone');
});
test('version names the commit; build changes only with the page files', async () => {
  const a = await appVersion({ HOMEBOARD_COMMIT: 'abcdef1234' });
  const b = await appVersion({ HOMEBOARD_COMMIT: 'not a sha' });
  assert.match(a.version, /^\d+\.\d+\.\d+\+abcdef1$/);
  assert.doesNotMatch(b.version, /\+/);
  assert.equal(a.build, b.build);
  assert.match(a.build, /^[0-9a-f]{12}$/);
});

test('a zone typed in any case is stored canonically and really changes local time', () => {
  const saved = validateConfig(SETTINGS.layout(base, { preset: 'left', weeks: '3', weekStart: 'monday', timeFormat: 'short', timeZone: ' asia/tokyo ' }));
  assert.equal(saved.timeZone, 'Asia/Tokyo');
  const before = process.env.TZ;
  try {
    assert.equal(applyTimeZone(saved), 'Asia/Tokyo');
    assert.equal(new Date(Date.UTC(2026, 0, 1, 12)).getHours(), 21);
  } finally { process.env.TZ = before; }
});
test('alerts name the last good update when there was one', async () => {
  const sent = [];
  const alerts = new Alerts({ send: async (m) => { sent.push(m); }, now: () => 0 });
  await alerts.update([{ key: 'weather', error: 'HTTP 500 from x', at: Date.UTC(2026, 10, 27, 15) }], 0);
  assert.match(sent[0].message, /weather has not updated since \w{3} \d+:\d\d/);
});

test('wiring: refresh reports to alerts, the snapshot carries quiet mode, saves apply the time zone', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Board } = await import('../src/board.js');
  const { ConfigStore } = await import('../src/config-edit.js');
  const dir = await mkdtemp(join(tmpdir(), 'hb-wire-'));
  const seen = [];
  const config = validateConfig({
    location: { latitude: 1, longitude: 2 }, layout: { widgets: [] },
    night: { enabled: true, mode: 'on', show: ['clock', 'next'], brightness: 25 },
    calendars: [{ name: 'Home', type: 'static', color: '#123456', events: [{ day: 2, time: '23:00', title: 'Late' }] }],
  });
  const now = () => new Date(2026, 10, 25, 22);
  const board = new Board({ config, dataDir: dir, now, log() {}, photos: { scan: async () => [], ids: () => [] },
    alerts: { update: async (status, delay) => { seen.push([status.map((s) => s.key), delay]); } } });
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  try { await board.refresh(); } finally { globalThis.fetch = real; }
  assert.deepEqual(seen, [[['cal:Home', 'weather', 'aqi', 'photos'], 60]]);
  assert.deepEqual(board.snapshot().night, { show: ['clock', 'next'], brightness: 25, next: { title: 'Late', when: 'Today 11p', color: '#123456' } });

  const zones = [];
  const store = new ConfigStore({ board, file: join(dir, 'config.json'), iconExists: async () => true, onSaved: (c) => zones.push(c.timeZone) });
  await store.apply('layout', { preset: 'left', weeks: '3', weekStart: 'monday', timeFormat: 'short', timeZone: 'Europe/Paris' });
  assert.deepEqual(zones, ['Europe/Paris']);
});
