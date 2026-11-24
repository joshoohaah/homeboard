// npm run demo: the board with invented events and plain photos, live weather and word of the day.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = await mkdtemp(join(tmpdir(), 'homeboard-'));
for (const [i, background] of ['#3d6b8c', '#7a4a3a', '#4a7a45'].entries()) {
  await sharp({ create: { width: 900, height: 1200, channels: 3, background } }).jpeg().toFile(join(dir, `demo${i}.jpg`));
}
Object.assign(process.env, {
  TZ: 'America/New_York', DATA_DIR: dir, PHOTO_DIR: dir, ADMIN_PASSWORD: 'demo',
  CONFIG_FILE: fileURLToPath(new URL('config.json', import.meta.url)),
});
await import('../src/server.js');
