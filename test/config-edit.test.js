import './setup.js';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigStore } from '../src/config-edit.js';
import { Board } from '../src/board.js';
import { loadConfig, validateConfig } from '../src/config.js';

const ICS = { type: 'ics', color: '#112233' };
let board, file, store, gate;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hb-edit-'));
  file = join(dir, 'config.json');
  gate = null;
  const config = validateConfig({
    location: { latitude: 1, longitude: 2 }, colorRules: [{ match: 'x', color: '#000000', calendar: 'A' }], custom: 'kept',
    calendars: [{ name: 'A', ...ICS, url: 'https://a.test/1.ics', icon: 'soccer' }, { name: 'B', ...ICS, url: 'https://b.test/1.ics' }],
  });
  const google = { events: async () => { await gate; return [{ title: 'old', allDay: true, start: '2026-11-25', end: '2026-11-26' }]; } };
  board = new Board({ config, google, photos: { scan: async () => [], ids: () => [] }, dataDir: dir, log() {}, now: () => new Date(2026, 10, 24) });
  store = new ConfigStore({ board, file, iconExists: async (n) => n !== 'nope' });
});
const names = () => board.config.calendars.map((c) => c.name);
const add = (name) => store.apply('add-ics', { name, color: '#445566', url: 'webcal://c.test/x.ics' });

test('add, update, reorder and remove are saved and applied', async () => {
  await store.apply('add-google', { name: ' Band ', color: '#445566', icon: '', account: 'mom', calendar: 'id@group' });
  await store.apply('update', { was: 'A', name: 'Team', color: '#abcdef', icon: '' });
  await store.apply('up', { was: 'Band' });
  await store.apply('remove', { was: 'B' });
  assert.deepEqual(names(), ['Team', 'Band']);
  const saved = await loadConfig(file);
  assert.deepEqual(saved, board.config);
  assert.equal(saved.custom, 'kept');
  assert.equal(saved.colorRules[0].calendar, 'Team', 'rules follow a rename');
  assert.equal('icon' in saved.calendars[0], false, 'an empty icon removes it');
  assert.equal(saved.calendars[0].url, 'https://a.test/1.ics', 'the link is kept');
});
test('bad edits change nothing', async () => {
  for (const [action, fields, error] of [
    ['add-ics', { name: 'A', color: '#445566', url: 'https://x.test/' }, /unique/],
    ['add-ics', { name: 'C', color: '#445566', url: 'file:///etc/passwd' }, /url/],
    ['add-ics', { name: 'C', color: '#445566', url: 'https://' }, /url/],
    ['add-ics', { name: 'C', color: 'red', url: 'https://x.test/' }, /color/],
    ['add-ics', { name: '   ', color: '#445566', url: 'https://x.test/' }, /name/],
    ['add-ics', { name: 'C', color: '#445566', icon: 'nope', url: 'https://x.test/' }, /icon/],
    ['add-google', { name: 'C', color: '#445566', account: 'photos:picker', calendar: 'x' }, /account/],
    ['remove', { was: 'missing' }, /no calendar/],
    ['constructor', {}, /Unknown/],
  ]) await assert.rejects(store.apply(action, fields), error);
  assert.deepEqual(names(), ['A', 'B']);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});
test('edits at the same time are all kept', async () => {
  await Promise.all(['C', 'D', 'E'].map(add));
  assert.deepEqual(names(), ['A', 'B', 'C', 'D', 'E']);
});
test('a fetch that was running when a calendar changed cannot show the old events', async () => {
  await store.apply('add-google', { name: 'G', color: '#445566', account: 'mom', calendar: 'one' });
  let open;
  gate = new Promise((resolve) => { open = resolve; });
  const running = board.refresh();
  await store.apply('remove', { was: 'G' });
  await add('G');
  open();
  await running;
  assert.equal(JSON.stringify(board.snapshot().weeks).includes('old'), false);
});
