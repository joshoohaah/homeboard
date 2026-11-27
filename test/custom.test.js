import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CustomFiles } from '../src/custom.js';

test('custom files edited on disk are picked up, and an unreadable one is ignored', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hb-custom-'));
  await mkdir(join(folder, 'custom.html')); // a folder where a file should be
  const logged = [];
  const files = new CustomFiles(folder, (message) => logged.push(message));
  await files.load();
  assert.equal(files.html, '');
  assert.match(logged[0], /custom\.html could not be read/);

  await writeFile(join(folder, 'custom.css'), 'a{}');
  const before = files.version;
  await files.load();
  assert.equal(files.css, 'a{}');
  assert.notEqual(files.version, before);

  await rm(join(folder, 'custom.css'));
  await files.load();
  assert.equal(files.css, '', 'deleting the file restores the default look');
});

test('line endings from a browser do not count twice toward the limit', async () => {
  const files = new CustomFiles(await mkdtemp(join(tmpdir(), 'hb-custom-')));
  await files.save('css', 'b{}\r\n'.repeat(12_000));
  assert.equal(files.css.length, 48_000);
  await assert.rejects(files.save('css', 'x'.repeat(50_001)), /under 50000/);
});
