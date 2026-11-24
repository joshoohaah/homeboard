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
3. Copy this folder (without `node_modules`) to the NAS and build in its shell:
   `sudo docker build -t homeboard:latest /mnt/POOL/apps/homeboard/src`
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

To update: copy the files, build again, restart the app.

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
| `weeks`, `refreshMinutes`, `photoSeconds` | 6, 5, 30 by default |

Colors set on individual events are used when the board reads the calendar through its owner's account. Google hides
them from people the calendar is shared with, and ICS feeds do not carry them: use `colorRules` there.
Photos: JPG, PNG, WebP, AVIF or GIF, in any subfolder. HEIC files in the folder are skipped; photos picked from Google Photos arrive as JPEG.
