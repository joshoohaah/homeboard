import { join } from 'node:path';
import { loadConfig } from './config.js';
import { GoogleClient } from './google.js';
import { loadGoogleKey } from './google-key.js';
import { Photos } from './photos.js';
import { PhotoImport } from './google-photos.js';
import { Board } from './board.js';
import { ConfigStore } from './config-edit.js';
import { createApp, iconExists } from './app.js';
import { CustomFiles } from './custom.js';
import { Alerts, webhookSender } from './alerts.js';
import { applyTimeZone } from './timezone.js';
import { appVersion } from './version.js';

const env = process.env;
const dataDir = env.DATA_DIR || 'data';
const port = Number(env.PORT || 8080);

// An https address suggests the board is reachable beyond the LAN: never open it by accident.
if (env.PUBLIC_URL?.startsWith('https:') && !env.DISPLAY_KEY) throw new Error('Set DISPLAY_KEY when PUBLIC_URL is https');

const configFile = env.CONFIG_FILE || join(dataDir, 'config.json');
const config = await loadConfig(configFile);
console.log(`time zone: ${applyTimeZone(config)}`);
const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');
const key = await loadGoogleKey(env, dataDir, `${publicUrl}/admin/oauth/callback`);
const google = new GoogleClient({ ...key, dataDir, publicUrl });
const importDir = join(dataDir, 'imported-photos');
const photos = new Photos([env.PHOTO_DIR, importDir]);
let board;
const alerts = new Alerts({ send: webhookSender(() => board.config.alerts.webhook) });
board = new Board({ config, google, photos, dataDir, alerts });
const photoImport = new PhotoImport({ google, dir: importDir, onDone: () => photos.scan() });
await board.load();
const refresh = () => board.refresh().catch((err) => console.error('refresh:', err.message));
refresh();
setInterval(refresh, config.refreshMinutes * 60_000);

const custom = new CustomFiles(dataDir, console.error);
await custom.load();
const store = new ConfigStore({ board, file: configFile, iconExists, onSaved: applyTimeZone });
const version = await appVersion();
createApp({ board, photos, google, photoImport, store, custom, alerts, version, env }).listen(port, () => console.log(`Homeboard ${version.version} on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
