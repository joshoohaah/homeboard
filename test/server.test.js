import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ConfigStore } from '../src/config-edit.js';
import { createApp, iconExists } from '../src/app.js';
import { Board } from '../src/board.js';
import { Photos } from '../src/photos.js';
import { GoogleClient } from '../src/google.js';
import { validateConfig } from '../src/config.js';
import { CustomFiles, CUSTOM_HTML_CSP } from '../src/custom.js';

const realFetch = globalThis.fetch;
let quoteCalls = 0, custom, dir, photos, google, board, server, base, icsUp = true, lastEventsQuery;

const ROUTES = {
  'feeds.test': () => (icsUp ? new Response('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Game\r\nDTSTART;VALUE=DATE:20261126\r\nEND:VEVENT\r\nEND:VCALENDAR') : new Response('', { status: 500 })),
  'oauth2.googleapis.com': () => Response.json({ access_token: 'at', refresh_token: 'refresh-secret', expires_in: 3600 }),
  'www.googleapis.com': (u) => {
    if (u.pathname.endsWith('/calendarList')) return Response.json({ items: [{ id: 'abc@group', summary: 'Band' }, { id: 'free@group', summary: '<i>Free', backgroundColor: 'bad"' }] });
    if (u.pathname.endsWith('abc%40group')) return Response.json({ labelProperties: { eventLabels: [{ id: 'L', backgroundColor: '#f6bf26' }, { id: 'X', backgroundColor: 'url(evil)' }] } });
    lastEventsQuery = u;
    const second = u.searchParams.has('pageToken');
    return Response.json({ items: [{ summary: second ? 'P2' : 'P1', eventLabelId: 'L', start: { date: '2026-11-27' }, end: { date: '2026-11-28' } }], ...(!second && { nextPageToken: 'n' }) });
  },
  'api.open-meteo.com': () => Response.json({ current: { temperature_2m: 25.2, apparent_temperature: 23, weather_code: 3, is_day: 1 },
    daily: { time: ['2026-11-24', '2026-11-25'], weather_code: [3, 61], temperature_2m_max: [37, 41], temperature_2m_min: [21, 28], precipitation_probability_max: [0, null] } }),
  'air-quality-api.open-meteo.com': () => Response.json({ current: { us_aqi: 13 } }),
  'zenquotes.io': () => { quoteCalls += 1; return Response.json([{ q: 'Begin &amp; go.', a: 'Someone' }]); },
  'v2.jokeapi.dev': () => Response.json({ error: false, safe: true, joke: 'A pun.' }),
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hb-test-'));
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } }).jpeg().toFile(join(dir, 'a.jpg'));
  await writeFile(join(dir, 'secret.txt'), 'no');
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    return (ROUTES[u.hostname] ?? (() => new Response('', { status: 503 })))(u);
  };
  photos = new Photos(dir);
  google = new GoogleClient({ clientId: 'id', clientSecret: 's', publicUrl: 'https://b.test', dataDir: join(dir, 'data') });
  const config = validateConfig({ location: { latitude: 1, longitude: 2 }, colorRules: [{ match: 'game', color: '#00ff00' }], calendars: [
    { name: 'Team', type: 'ics', url: 'https://feeds.test/secret-token/basic.ics', color: '#112233' },
    { name: 'Band', type: 'google', account: 'mom', calendar: 'Band', color: '#445566', icon: 'music' },
  ] });
  board = new Board({ config, google, photos, dataDir: join(dir, 'data'), log() {}, now: () => new Date(2026, 10, 24, 9) });
  const store = new ConfigStore({ board, file: join(dir, 'config.json'), iconExists });
  custom = new CustomFiles(join(dir, 'data'));
  await custom.load();
  server = createApp({ board, photos, google, store, custom, version: { version: '9.9.9+abc1234', build: 'build-1' }, photoImport: { status: 'idle', start: async (r) => `https://photos.google.com/${r}` }, log() {}, env: { ADMIN_PASSWORD: 'pw', DISPLAY_KEY: 'k', PUBLIC_URL: 'https://b.test' } });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); server.closeAllConnections(); globalThis.fetch = realFetch; });

const get = (path, headers = {}) => realFetch(base + path, { headers, redirect: 'manual' });
const basic = { authorization: `Basic ${btoa('admin:pw')}` };
const login = async () => (await get('/?key=k')).headers.get('set-cookie').split(';')[0];
const day = (date) => board.snapshot().weeks.flatMap((w) => w.days).find((d) => d.date === date).events;

test('calendars are edited only with the password and the form token', async () => {
  const post = (fields, headers = basic) => realFetch(`${base}/admin/save`, { method: 'POST', redirect: 'manual', headers, body: new URLSearchParams(fields) });
  const html = await (await get('/admin', basic)).text();
  const token = html.match(/name="token" value="([^"]+)"/)[1];
  assert.doesNotMatch(html, /secret-token/, 'iCal secrets stay hidden');
  const fields = { action: 'add-ics', name: '<b>New</b>', color: '#123456', icon: 'soccer', url: 'https://feeds.test/n.ics', token };
  assert.equal((await post(fields, {})).status, 401);
  assert.equal((await post({ ...fields, token: 'forged' })).status, 403);
  assert.equal((await post({ ...fields, icon: 'no-such-icon' })).status, 400);
  assert.equal((await post({ ...fields, name: 'x'.repeat(20000) })).status, 400);
  assert.equal(board.config.calendars.length, 2);
  assert.equal((await post(fields)).status, 303);
  assert.equal(board.config.calendars[2].name, '<b>New</b>');
  assert.doesNotMatch(await (await get('/admin', basic)).text(), /<b>New/);
  assert.equal((await post({ action: 'remove', was: '<b>New</b>', token })).status, 303);
  assert.equal(board.config.calendars.length, 2);
});
test('board is private without the key', async () => {
  for (const p of ['/', '/api/board', '/photos/0123456789abcdef']) assert.equal((await get(p)).status, 403);
  assert.equal((await get('/?key=bad')).status, 403);
  assert.equal((await get('/', { cookie: await login() })).status, 200);
  assert.equal(await (await get('/healthz')).text(), 'ok 9.9.9+abc1234');
  assert.equal((await (await get('/api/board', { cookie: await login() })).json()).build, 'build-1', 'screens reload on this');
  assert.match(await (await get('/admin', basic)).text(), /version 9\.9\.9\+abc1234/);
});
test('the cookie is HTTPS-only exactly when the visitor came in over HTTPS', async () => {
  const cookie = async (headers) => (await get('/?key=k', headers)).headers.get('set-cookie');
  // PUBLIC_URL is https here: a browser on the plain local address must still keep its cookie.
  assert.doesNotMatch(await cookie({}), /Secure/);
  assert.doesNotMatch(await cookie({ 'x-forwarded-proto': 'http' }), /Secure/);
  for (const proto of ['https', 'HTTPS', 'https, http']) {
    assert.match(await cookie({ 'x-forwarded-proto': proto }), /HttpOnly.*Secure/, proto);
  }
  assert.match(await cookie({}), /HttpOnly; SameSite=Lax/);
});
test('admin needs the password and rejects unknown accounts and forged state', async () => {
  assert.equal((await get('/admin')).status, 401);
  assert.equal((await get('/admin', { authorization: `Basic ${btoa('admin:no')}` })).status, 401);
  assert.equal((await get('/admin/oauth/callback?code=x&state=y')).status, 401);
  assert.equal((await get('/admin', basic)).status, 200);
  const scope = new URL((await get('/admin/connect?account=photos%3Apicker', basic)).headers.get('location')).searchParams.get('scope');
  assert.match(scope, /photospicker/);
  assert.equal((await get('/admin/photos')).status, 401);
  assert.equal((await get('/admin/photos?mode=replace', basic)).headers.get('location'), 'https://photos.google.com/true');
  assert.equal((await get('/admin/connect?account=bad%20name', basic)).status, 400);
  assert.equal((await get('/admin/oauth/callback?code=x&state=forged', basic)).status, 400);
  assert.equal((await get('/admin/oauth/callback', basic)).status, 400);
});
test('google connects, finds the calendar by name and pages through events', async () => {
  const loc = (await get('/admin/connect?account=mom', basic)).headers.get('location');
  const state = new URL(loc).searchParams.get('state');
  const back = await get(`/admin/oauth/callback?code=c&state=${state}`, basic);
  assert.equal(back.headers.get('location'), '/admin');
  assert.equal((await get(`/admin/oauth/callback?code=c&state=${state}`, basic)).status, 400, 'state is single use');
  await board.refresh();
  assert.match(lastEventsQuery.pathname, /abc%40group/);
  assert.deepEqual(day('2026-11-27').map((e) => [e.title, e.color, e.icon]), [['P1', '#f6bf26', 'music'], ['P2', '#f6bf26', 'music']]);
  const html = await (await get('/admin', basic)).text();
  assert.match(html, /1 calendars to add[\s\S]*free@group/);
  assert.doesNotMatch(html, /abc@group|<i>Free|bad"/, 'used ones are not offered again; names are escaped');
});
test('a failing feed keeps its last events, also after a restart', async () => {
  icsUp = false;
  await board.refresh();
  assert.deepEqual(day('2026-11-26').map((e) => [e.title, e.color]), [['Game', '#00ff00']]);
  assert.match(board.status().find((s) => s.key === 'cal:Team').error, /500/);
  const again = new Board({ config: board.config, google, photos, dataDir: board.dataDir, now: board.now });
  await again.load();
  assert.ok(JSON.stringify(again.snapshot().weeks).includes('Game'));
});
test('snapshot has data but no secrets', async () => {
  const text = await (await get('/api/board', { cookie: await login() })).text();
  const b = JSON.parse(text);
  assert.equal(b.weather.temp, 25);
  assert.equal(b.weather.days[1].rain, 0);
  assert.equal(b.aqi.label, 'Good');
  assert.ok(b.problems.includes('word'));
  assert.doesNotMatch(text, /secret-token|"mom"|refresh-secret/);
  assert.match(await readFile(join(dir, 'data', 'google-tokens.json'), 'utf8'), /refresh-secret/);
});
test('photos are resized; paths and other files are unreachable', async () => {
  const cookie = await login();
  assert.equal(photos.ids().length, 1);
  const res = await get(`/photos/${photos.ids()[0]}`, { cookie });
  assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 1200);
  for (const p of ['/photos/../secret.txt', '/photos/ffffffffffffffff', '/icons/..%2f..%2fpackage.svg', '/icons/nope-nope.svg', '/data/config.json']) {
    assert.equal((await get(p, { cookie })).status, 404, p);
  }
  await rm(join(dir, 'a.jpg'));
  assert.equal((await get(`/photos/${photos.ids()[0]}`, { cookie })).status, 404);
  assert.equal((await get('/icons/penguin.svg')).status, 200, 'the admin page has no display cookie');
  assert.equal((await get('/admin/icons.json')).status, 401);
  assert.ok((await (await get('/admin/icons.json', basic)).json()).groups.Sports.includes('soccer'));
  assert.equal((await get('/admin/icon-picker.js', basic)).status, 200);
  assert.equal((await realFetch(`${base}/api/board`, { method: 'POST' })).status, 405);
});

test('layout, shortening and custom files are saved from the admin page and reach the board', async () => {
  const html = await (await get('/admin', basic)).text();
  const token = html.match(/name="token" value="([^"]+)"/)[1];
  const post = (fields) => realFetch(`${base}/admin/save`, { method: 'POST', redirect: 'manual', headers: basic, body: new URLSearchParams({ token, ...fields }) });
  const layout = { action: 'layout', section: 'layout', preset: 'top', weeks: '2', weekStart: 'sunday', timeFormat: 'long', legend: 'on',
    'show-quote': 'on', 'order-quote': '2', 'show-clock': 'on', 'order-clock': '1', 'show-joke': 'on', 'order-joke': '', 'show-word': '' };
  const saved = await post(layout);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get('location'), '/admin#layout');
  assert.deepEqual(board.config.layout, { preset: 'top', legend: true, widgets: ['clock', 'quote', 'joke'] });
  assert.equal((await post({ ...layout, preset: 'diagonal' })).status, 400);
  assert.equal((await post({ action: 'shorten-add', match: 'Ga', replace: 'G' })).status, 303);
  await board.refresh();
  await board.refresh();
  assert.equal(quoteCalls, 1, 'the quote is fetched once a day');
  const snap = JSON.parse(await (await get('/api/board', { cookie: await login() })).text());
  assert.deepEqual([snap.weeks.length, snap.days[0], snap.quote.text, snap.joke.text], [2, 'S', 'Begin & go.', 'A pun.']);
  assert.ok(snap.weeks.flatMap((w) => w.days).some((d) => d.events.some((e) => e.title === 'Gme' && e.color === '#00ff00')), 'colors use the full title');
  assert.match(await (await get('/admin', basic)).text(), /becomes "Gme"/);
  assert.equal((await post({ action: 'shorten-remove', index: '0' })).status, 303);
  assert.equal((await post({ action: 'shorten-remove', index: '5' })).status, 400);

  const cookie = await login();
  const before = snap.custom;
  assert.equal((await post({ action: 'custom-css', text: ':root { --hb-accent: #00f; }' })).status, 303);
  assert.equal((await post({ action: 'custom-html', text: '<p>Hi</p><script>alert(1)</script>' })).status, 303);
  assert.equal((await post({ action: 'custom-css', text: 'x'.repeat(60000) })).status, 400);
  assert.equal(await (await get('/custom.css', { cookie })).text(), ':root { --hb-accent: #00f; }');
  const page = await get('/custom.html', { cookie });
  assert.equal(page.headers.get('content-security-policy'), CUSTOM_HTML_CSP);
  assert.match(CUSTOM_HTML_CSP, /default-src 'none'.*sandbox/);
  assert.match(await page.text(), /<p>Hi<\/p>/);
  assert.equal((await get('/custom.css')).status, 403, 'custom files need the display key');
  const after = JSON.parse(await (await get('/api/board', { cookie })).text()).custom;
  assert.notEqual(after, before);
  assert.equal((await get('/admin/pico.css', basic)).status, 200);
  assert.equal((await get('/vendor/open-props.css', { cookie })).status, 200);
});
