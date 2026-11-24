import { join } from 'node:path';
import { loadConfig } from './config.js';
import { GoogleClient } from './google.js';
import { Photos } from './photos.js';
import { PhotoImport } from './google-photos.js';
import { Board } from './board.js';
import { createApp } from './app.js';

const env = process.env;
const dataDir = env.DATA_DIR || 'data';
const port = Number(env.PORT || 8080);

// An https address suggests the board is reachable beyond the LAN: never open it by accident.
if (env.PUBLIC_URL?.startsWith('https:') && !env.DISPLAY_KEY) throw new Error('Set DISPLAY_KEY when PUBLIC_URL is https');

const config = await loadConfig(env.CONFIG_FILE || join(dataDir, 'config.json'));
const google = new GoogleClient({
  clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, dataDir,
  publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
});
const importDir = join(dataDir, 'imported-photos');
const photos = new Photos([env.PHOTO_DIR, importDir]);
const board = new Board({ config, google, photos, dataDir });
const photoImport = new PhotoImport({ google, dir: importDir, onDone: () => photos.scan() });
await board.load();
const refresh = () => board.refresh().catch((err) => console.error('refresh:', err.message));
refresh();
setInterval(refresh, config.refreshMinutes * 60_000);

createApp({ board, photos, google, photoImport, env }).listen(port, () => console.log(`Homeboard on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
