import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PhotoImport } from '../src/google-photos.js';
import { Photos } from '../src/photos.js';

const realFetch = globalThis.fetch;
let dir, calls, polls, media, picked, importer;

const item = (id, over = {}) => ({ id, type: 'PHOTO', mediaFile: { baseUrl: `https://lh3.googleusercontent.com/${id}` }, ...over });

before(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'hb-gp-')), 'imported');
  const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    calls.push([options.method ?? 'GET', u.hostname, u.pathname, options.headers?.authorization]);
    if (u.hostname === 'lh3.googleusercontent.com') return u.pathname.startsWith('/broken') ? new Response('', { status: 404 }) : new Response(jpeg);
    if (options.method === 'DELETE') return Response.json({});
    if (u.pathname === '/v1/mediaItems') {
      return u.searchParams.has('pageToken') ? Response.json({ mediaItems: media.slice(1) })
        : Response.json({ mediaItems: media.slice(0, 1), nextPageToken: 'n' });
    }
    if (options.method === 'POST') return Response.json({ id: 's1', pickerUri: 'https://photos.google.com/picker/x', pollingConfig: { pollInterval: '5s', timeoutIn: '20s' } });
    polls += 1;
    return Response.json({ mediaItemsSet: picked && polls > 1 });
  };
  importer = new PhotoImport({ google: { accessToken: async () => 'tok' }, dir, log() {}, wait: async () => {} });
});
after(() => { globalThis.fetch = realFetch; });

async function run(items, replace = false, didPick = true) {
  calls = []; polls = 0; media = items; picked = didPick;
  const uri = await importer.start(replace);
  await importer.finished;
  return uri;
}

test('copies picked photos across pages, skips videos, cleans up the session', async () => {
  assert.equal(await run([item('a'), item('b'), item('v', { type: 'VIDEO' })]), 'https://photos.google.com/picker/x/autoclose');
  assert.equal(importer.status, '2 photos ready.');
  assert.equal((await readdir(dir)).length, 2);
  assert.ok(calls.some(([method]) => method === 'DELETE'));
  assert.equal((await new Photos([dir, '/missing-folder']).scan()).length, 2);
});
test('picking again does not download twice', async () => {
  await run([item('a')]);
  assert.ok(!calls.some(([, host]) => host === 'lh3.googleusercontent.com'));
  assert.equal((await readdir(dir)).length, 2);
});
test('never sends the token to another host', async () => {
  await run([item('evil', { mediaFile: { baseUrl: 'https://evil.test/googleusercontent.com/' } })]);
  assert.ok(!calls.some(([, host]) => host === 'evil.test'));
  assert.match(importer.status, /1 failed/);
});
test('replace keeps old photos unless every new one arrived', async () => {
  await run([item('c'), item('broken')], true);
  assert.match(importer.status, /Old photos were kept/);
  assert.equal((await readdir(dir)).length, 3);
  await run([item('c')], true);
  assert.match(importer.status, /2 old photos removed/);
  assert.equal((await readdir(dir)).length, 1);
});
test('picking nothing in time leaves everything alone', async () => {
  await run([], true, false);
  assert.match(importer.status, /Nothing was picked/);
  assert.equal((await readdir(dir)).length, 1);
});
