# Deploying Homeboard

TrueNAS runs the server, the Pi shows it in a browser, DAKboard stays as it is until you are happy.

## 1. Google (once)

1. At <https://console.cloud.google.com>, create a project and enable **Google Calendar API** and **Google Photos Picker API**.
2. **Google Auth Platform**: audience **External**, then **Publish app**. If it stays in *Testing*, Google
   ends every sign-in after 7 days. Google will warn that the app is unverified; it is your own app.
3. **Clients > Create client > Web application**, redirect URI:
   `https://board.YOURDOMAIN/admin/oauth/callback` (must match `PUBLIC_URL` exactly).

4. Download the client's JSON and save it as `google-client.json` in the data folder (or set `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET`). Git and the Docker build ignore it.

Access is read-only. Tokens are stored in the `data` dataset in `google-tokens.json`, so keep it private.

## 2. TrueNAS

1. Create datasets for `data` and photos. Give the `apps` user (568) write on `data`, read on photos.
2. Copy `config.example.json` to the `data` dataset as `config.json`. Fill in your calendars and coordinates.
3. Nothing to build: the image `ghcr.io/joshoohaah/homeboard` is published for every change to `main`.
4. **Apps > Custom App > Install via YAML**: paste `compose.yaml` with your pool, domain and secrets.
5. Point your reverse proxy at port 8480. The proxy must send `X-Forwarded-Proto` (Traefik, Caddy and
   Nginx Proxy Manager do). The local address `http://NAS:8480/?key=...` works too; the key then crosses your LAN unencrypted.
   The board shows your family's schedule: prefer LAN/VPN-only, and do not expose it without `DISPLAY_KEY`.
6. Open `https://board.YOURDOMAIN/admin` (any user name, `ADMIN_PASSWORD`) and press **Connect** for
   each account. Each owner signs in to their own account, on any computer.
7. The same page adds calendars from a connected account or an iCal link, changes names, colors, icons and order,
   and shows any source that fails. Changes apply at once. Edits made directly in `config.json` need a restart.
8. Photos: on the same page press **Connect Google Photos**, then **Add photos**. Pick in Google Photos while signed
   in to that same account, press Done, and the board copies them to `data/imported-photos` (up to 2000 per pick).
   Google no longer lets apps follow an album, so pick again to add newer photos. The `/photos` folder is optional.

### Updating

- **Latest:** in TrueNAS, open the app and choose **Update** (or **Pull image** and restart). Wall screens reload
  themselves within a minute when the page has changed; no trip to the Pi.
- **Pinned:** use a version tag such as `:0.2.0` or a commit tag such as `:sha-1a2b3c4` in the YAML, and change
  it when you want to move. The running version shows on the admin page and at `/healthz`.

### Backups

The `data` dataset holds everything that matters: `config.json`, `google-client.json`, `google-tokens.json`,
`custom.css`, `custom.html` and photos picked from Google Photos. Protect it with a snapshot task:
**Data Protection > Periodic Snapshot Tasks > Add**, dataset `POOL/apps/homeboard`, recursive, daily, keep 2 weeks.
To go back, roll the dataset back to a snapshot (or copy one file out of `.zfs/snapshot`), then restart the app.
Replicate the dataset to another machine if you want a copy that survives the NAS.

### Alerts

When a calendar or other source fails for longer than the delay set on the admin page (60 minutes by default),
Homeboard sends one message to a Home Assistant webhook, and another when it recovers.

1. In Home Assistant, **Settings > Automations > Create automation > Edit in YAML**, and paste:

   ```yaml
   alias: Homeboard alerts
   triggers:
     - trigger: webhook
       webhook_id: homeboard-CHANGE-TO-A-LONG-RANDOM-ID
       allowed_methods: [POST]
       local_only: true
   actions:
     - action: notify.notify   # or notify.mobile_app_<your_phone>
       data:
         title: Homeboard
         message: "{{ trigger.json.message }}"
   ```

2. On the Homeboard admin page, under **Alerts**, enter `http://HOMEASSISTANT:8123/api/webhook/<that id>`, press
   **Save alerts**, then **Send a test alert**.

The message carries `event` (`down`, `recovered` or `test`), `source` and `message`. The webhook ID works like a
password: keep it long and random. `local_only` means Home Assistant only accepts it from your network.

## 3. Raspberry Pi

Use a **second SD card** so the DAKboard card is an instant way back.

1. Flash Raspberry Pi OS (64-bit, desktop). In `raspi-config`: auto-login to desktop, screen blanking off.
2. Put this in `~/.config/labwc/autostart`:

   ```sh
   chromium --kiosk --noerrdialogs --disable-infobars --password-store=basic https://board.YOURDOMAIN/ &
   ```

3. Once, open `https://board.YOURDOMAIN/?key=DISPLAY_KEY` in that browser. The cookie lasts a year.

## config.json

| Field | Meaning |
|---|---|
| `calendars[].type` | `google` (`account`, `calendar` name or ID) or `ics` (`url`) |
| `calendars[].icon` | pick it on the admin page (Material Design Icons); leave out for a dot |
| `colorRules` | e.g. `{ "match": "soccer", "color": "#f6bf26", "calendar": "Parent" }`; wins over Google's color |
| `weeks`, `weekStart`, `timeFormat`, `layout`, `shorten` | set them on the admin page; see [CUSTOMIZE.md](CUSTOMIZE.md) |
| `refreshMinutes`, `photoSeconds` | 5 and 30 by default |

Colors set on individual events are used when the board reads the calendar through its owner's account. Google hides
them from people the calendar is shared with, and ICS feeds do not carry them: use `colorRules` there.
Photos: JPG, PNG, WebP, AVIF or GIF, in any subfolder. HEIC files in the folder are skipped; photos picked from Google Photos arrive as JPEG.
