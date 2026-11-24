import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGoogleKey } from '../src/google-key.js';

const uri = 'http://localhost:8080/admin/oauth/callback';
async function folder(text) {
  const dir = await mkdtemp(join(tmpdir(), 'hb-key-'));
  if (text !== undefined) await writeFile(join(dir, 'google-client.json'), text);
  return dir;
}
const web = JSON.stringify({ web: { client_id: 'id', client_secret: 'file-secret', redirect_uris: [uri] } });

test('reads the downloaded web client; environment wins; missing file is fine', async () => {
  const dir = await folder(web);
  assert.deepEqual(await loadGoogleKey({}, dir, uri), { clientId: 'id', clientSecret: 'file-secret' });
  assert.equal((await loadGoogleKey({ GOOGLE_CLIENT_ID: 'e', GOOGLE_CLIENT_SECRET: 'f' }, dir, uri)).clientId, 'e');
  assert.deepEqual(await loadGoogleKey({}, await folder(), uri), {});
});
test('rejects other client types', async () => {
  await assert.rejects(loadGoogleKey({}, await folder('{"installed":{}}'), uri), /Web application/);
});
test('a broken file never leaks its content into the error', async () => {
  await assert.rejects(loadGoogleKey({}, await folder('{"web": top-secret'), uri), (err) => !err.message.includes('secret'));
});
