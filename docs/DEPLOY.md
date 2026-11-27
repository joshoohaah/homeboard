# Deploying Homeboard

The server runs as a container (these steps use TrueNAS; any Docker host works the same), and a Raspberry Pi or
any browser shows the board. If you are moving from DAKboard, keep it running until you are happy.

Contents: [1. Google](#1-google-once) · [2. The container](#2-the-container) ·
[Settings reference](#settings-reference) · [Settings file reference](#settings-file-reference) ·
[Updating](#updating) · [Backups](#backups) · [Alerts](#alerts) · [3. Raspberry Pi](#3-raspberry-pi)

## 1. Google (once)

Skip this if you only use iCal links.

1. At <https://console.cloud.google.com>, create a project and enable **Google Calendar API** and, for photos,
   **Google Photos Picker API**. Leave the Library and Ambient APIs off: Homeboard does not use them.
2. **Google Auth Platform > Audience**: user type **External**, then **Publish app**. While it stays in *Testing*,
   Google ends every sign-in after 7 days. Google will warn that the app is unverified; it is your own app, so choose
   **Advanced** and continue when you sign in.
3. **Clients > Create client > Web application**. Under **Authorized redirect URIs** add
   `https://board.YOURDOMAIN/admin/oauth/callback`. It must match `PUBLIC_URL` exactly; add
   `http://localhost:8080/admin/oauth/callback` too if you also run it on your own computer.
4. Download the client's JSON and save it as `google-client.json` in the data folder. It must start with `"web"`
   (a Desktop client will not work). Alternatively set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   (or `GOOGLE_CLIENT_SECRET_FILE`).

Access is read-only. Sign-ins are stored in `data/google-tokens.json`, so keep the data folder private.

## 2. The container

1. Create a dataset such as `POOL/apps/homeboard` with a `data` folder, and one for photos if you have any. Give the
   `apps` user (568) write on `data` and read on the rest. On another Docker host, use any user and match `user:`.
2. Copy [`config.example.yaml`](../config.example.yaml) next to it as `homeboard.yaml` and fill in your calendars and
   rules. (Or leave out the file and manage calendars on the admin page; they are then saved in `data/config.json`.)
3. Put each secret in its own file under `secrets/` (one line, no quotes): `admin_password`, `display_key` and, for
   alerts, `ha_webhook`. Make them readable by 568 only.
4. **Apps > Custom App > Install via YAML**: paste [`compose.yaml`](../compose.yaml) and change the pool, domain,
   location and variables. Nothing to build: `ghcr.io/joshoohaah/homeboard` is published for every change to `main`.
5. Point your reverse proxy (Traefik, Caddy, Nginx Proxy Manager) at port 8480. It must pass `X-Forwarded-Proto`, which
   all of these do by default. The local address `http://NAS:8480` works too; the display key then crosses your LAN
   unencrypted, so use the domain for `/admin`. The board shows your family's schedule: keep it on your LAN or VPN,
   and never expose it without `DISPLAY_KEY`.
6. Open `https://board.YOURDOMAIN/admin` (any user name, the admin password) and press **Connect** for each Google
   account; each owner signs in with their own account. A calendar shared with you can also be read through your
   account (but without the owner's per-event colors).
7. Settings that compose does not set can be changed on the same page and apply at once. Settings from compose show as
   locked; change them in compose and restart the app. **Configuration** at the bottom of the page lists what comes
   from where, and **Status** shows each source's last update and any error.
8. Photos: press **Connect Google Photos**, then **Add photos**. Pick in Google Photos while signed in to that same
   account and press Done; the board copies them to `data/imported-photos` (up to 2000 per pick). Google no longer
   lets apps follow an album, so pick again to add newer photos. Or put pictures in the `/photos` folder (JPG, PNG,
   WebP, AVIF, GIF; HEIC is skipped).

### Settings reference

Settings come from four places. Each one overrides the ones above it:

1. Built-in defaults.
2. The admin page, which saves to `data/config.json`.
3. `CONFIG_FILE`, a YAML or JSON file; calendars, color and shortening rules live here.
4. `HOMEBOARD_*` variables.

Anything set by 3 or 4 is locked on the admin page. Removing it from compose brings back what the admin page had
saved, or the default. A bad value stops the container at start with one line naming the setting and the variable or
file that set it; secret values are never printed. An unknown `HOMEBOARD_*` variable is an error too, so typos are
caught.

| Variable | Example | Setting |
|---|---|---|
| `CONFIG_FILE` | `/config/homeboard.yaml` | Settings file (`.yaml`, `.yml` or `.json`) |
| `HOMEBOARD_TITLE` | `Family Board` | Browser tab title |
| `HOMEBOARD_TIMEZONE` | `America/Chicago` | Time zone for the grid, times and quiet hours (IANA name, any case) |
| `HOMEBOARD_LATITUDE`, `HOMEBOARD_LONGITUDE` | `40.71`, `-74.01` | Weather and air quality location |
| `HOMEBOARD_UNITS` | `fahrenheit` | Or `celsius` |
| `HOMEBOARD_WEEKS` | `3` | Weeks shown, 1-6 |
| `HOMEBOARD_WEEK_START` | `monday` | Or `sunday` |
| `HOMEBOARD_TIME_FORMAT` | `short` | `6p`, or `long` for `6:00pm` |
| `HOMEBOARD_LAYOUT` | `left` | `left`, `right`, `top` or `calendar` |
| `HOMEBOARD_WIDGETS` | `clock,weather,aqi,forecast,word,photos` | In order; also `quote`, `joke`, `custom` |
| `HOMEBOARD_LEGEND` | `true` | Calendar legend on or off |
| `HOMEBOARD_QUIET` | `true` | Quiet mode on a schedule |
| `HOMEBOARD_QUIET_WINDOWS` | `sun-thu 21:30-06:30; fri,sat 23:00-08:00` | Days (`mon-fri`, `fri-sun`, `weekdays`, `weekends`, `daily`) and times; up to 3 |
| `HOMEBOARD_QUIET_SHOW` | `clock,date,next,weather` | What quiet mode shows |
| `HOMEBOARD_QUIET_BRIGHTNESS` | `40` | Percent, 5-100 |
| `HOMEBOARD_ALERTS_WEBHOOK` | `http://ha:8123/api/webhook/…` | Home Assistant webhook (a secret: prefer `_FILE`) |
| `HOMEBOARD_ALERTS_DELAY_MINUTES` | `60` | Minutes of failure before an alert, 5-1440 |
| `HOMEBOARD_REFRESH_MINUTES`, `HOMEBOARD_PHOTO_SECONDS` | `5`, `30` | How often sources update; how long each photo shows |

Server settings, never on the admin page:

| Variable | Default | |
|---|---|---|
| `PUBLIC_URL` | `http://localhost:PORT` | The address people use; Google redirects back to it |
| `ADMIN_PASSWORD` | none (admin page off) | Password for `/admin` |
| `DISPLAY_KEY` | none (board open) | Key each screen opens once as `/?key=…`; required with an https `PUBLIC_URL` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from `google-client.json` | Your Google app |
| `DATA_DIR`, `PHOTO_DIR`, `PORT` | `/data`, `/photos`, `8080` | Paths and port inside the container |
| `TZ` | `America/Chicago` | Fallback time zone when `HOMEBOARD_TIMEZONE` and the admin page set none |

**Secrets from files:** `ADMIN_PASSWORD_FILE`, `DISPLAY_KEY_FILE`, `GOOGLE_CLIENT_SECRET_FILE` and
`HOMEBOARD_ALERTS_WEBHOOK_FILE` read the value from a file, as compose `secrets:` provide. Set either the variable or
its `_FILE`, not both; an empty file is an error.

Always on the admin page: quiet mode's **Right now** override, custom CSS and HTML, Google sign-ins and photos.

**Changed in 0.3.0:** `CONFIG_FILE` used to name the file the admin page edits. It now names a read-only compose file
whose settings are locked; the admin page always saves to `data/config.json`. If you set `CONFIG_FILE` to anything
other than `/data/config.json`, move that file to `/data/config.json`, or keep it as your compose file.

### Settings file reference

The file uses the same names as `data/config.json`. Everything is optional; see
[`config.example.yaml`](../config.example.yaml).

| Key | Example | Meaning |
|---|---|---|
| `title` | `Family Board` | Browser tab title |
| `location` | `{ latitude: 40.71, longitude: -74.01, units: fahrenheit }` | Weather location and units |
| `timeZone`, `weeks`, `weekStart`, `timeFormat` | `America/Chicago`, `3`, `monday`, `short` | As the variables above |
| `refreshMinutes`, `photoSeconds` | `5`, `30` | As the variables above |
| `layout` | `{ preset: left, legend: true, widgets: [clock, weather] }` | Layout and widgets in order |
| `night` | `{ enabled: true, brightness: 40, show: [clock, next], windows: [...] }` | Quiet mode; a window is `{ days: [0-6], start: "21:30", end: "06:30" }`, 0 = Sunday |
| `alerts` | `{ delayMinutes: 60 }` | Keep the webhook in a secret file |
| `calendars` | see below | The calendars, in legend order |
| `colorRules` | `{ match: soccer, color: "#f6bf26", calendar: Parent }` | A title containing `match` gets the color; `calendar` is optional |
| `shorten` | `{ match: "Varsity ", replace: "V ", regex: false, calendar: Team }` | Find and replace in titles, in order |

Each calendar:

| Key | Needed for | Meaning |
|---|---|---|
| `name` | all | Shown in the legend, up to 60 characters, unique |
| `type` | all | `google` or `ics` |
| `color` | all | `#rrggbb` |
| `icon` | optional | A [Material Design Icons](https://pictogrammers.com/library/mdi/) name such as `soccer`; a dot without |
| `account` | `google` | A short name you choose (letters, digits, `-`, `_`); press **Connect** for it on the admin page |
| `calendar` | `google` | The calendar's name or ID as listed on the admin page after connecting |
| `url` | `ics` | `https://` or `webcal://` link |

Colors set on individual events in Google are used when the calendar is read through its owner's account; Google
hides them from people the calendar is shared with, and iCal feeds do not carry them. Use `colorRules` for those.

### Updating

- **Latest:** in TrueNAS, open the app and choose **Update** (or **Pull image** and restart). Wall screens reload by
  themselves within a minute when the page has changed; no trip to the Pi.
- **Pinned:** use a version tag such as `:0.3.0` or a commit tag such as `:sha-1a2b3c4`, and change it when you want
  to move. The running version shows on the admin page and at `/healthz`.
- Compose changes (variables, the settings file) apply when the app restarts.

### Backups

The `data` dataset holds everything that matters: `config.json`, `google-client.json`, `google-tokens.json`,
`custom.css`, `custom.html` and photos picked from Google Photos. Keep `homeboard.yaml` and the secrets next to it.
Protect them with a snapshot task: **Data Protection > Periodic Snapshot Tasks > Add**, dataset `POOL/apps/homeboard`,
recursive, daily, keep 2 weeks. To go back, roll the dataset back to a snapshot (or copy one file out of
`.zfs/snapshot`), then restart the app. Replicate the dataset to another machine for a copy that survives the NAS.

### Alerts

When a calendar or other source fails for longer than the delay (60 minutes by default), Homeboard sends one message
to a Home Assistant webhook, and another when it recovers.

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

2. Put `http://HOMEASSISTANT:8123/api/webhook/<that id>` in the `ha_webhook` secret file (or, on the admin page under
   **Alerts**, enter it and press **Save alerts**). Then press **Send a test alert** on the admin page.

The message carries `event` (`down`, `recovered` or `test`), `source` and `message`. The webhook ID works like a
password: keep it long and random. `local_only` means Home Assistant only accepts it from your network.

## 3. Raspberry Pi

Use a **second SD card** so the old card is an instant way back.

1. Flash Raspberry Pi OS (64-bit, with desktop). In `raspi-config`: auto-login to the desktop, and screen blanking
   off (quiet mode dims the board instead).
2. Put this in `~/.config/labwc/autostart`:

   ```sh
   chromium --kiosk --noerrdialogs --disable-infobars --password-store=basic https://board.YOURDOMAIN/ &
   ```

3. Once, open `https://board.YOURDOMAIN/?key=DISPLAY_KEY` in that browser. The cookie lasts a year. The domain and a
   local address such as `http://NAS:8480` each need their own first visit.

The board scales to the screen's width and is laid out for 16:9 landscape. Updates reach the screen by themselves;
the Pi only needs a reboot for its own updates. Turning the monitor itself off at night needs Home Assistant or
software on the Pi, which Homeboard does not do yet.

If something goes wrong, see the troubleshooting table in the [README](../README.md#troubleshooting).
