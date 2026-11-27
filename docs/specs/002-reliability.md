# 002 — Reliability

- **Status:** done
- **Owner:** repo owner
- **Issue/PR:** —

## Problem
The board runs unattended on a wall, but it cannot look after itself. After the server is updated, the wall screen
keeps running the old page until someone reboots the Pi. Updating means copying files and building on the NAS. The
data folder (config, Google sign-ins, custom CSS) has no backup the app knows about. When a calendar stops updating,
the only sign is a small red note on the wall, which nobody may read for days. The screen shows the same bright image
all night.

## Acceptance criteria
- [x] Given the server is updated to a new version, when a wall screen next polls, then it reloads itself within
      a minute, at most once per version, and never in a loop if the new page fails to load.
- [x] Given a merge to `main` or a version tag, then GitHub Actions publishes a multi-arch image (amd64, arm64) to
      `ghcr.io/joshoohaah/homeboard`, tagged `latest`, the version, and the commit; pull requests only build it.
- [x] Given the image, then `/healthz` reports the running version, and the admin page shows it.
- [x] Given a source has failed for longer than the alert delay, then one notification is sent; another is sent
      when it recovers; no repeats while it stays down.
- [x] Given quiet-mode windows (each with days, start and end; up to 3), then during a window the board shows only
      the chosen parts (clock, date, next event, weather) at the chosen brightness; outside them it is normal. A
      window ending earlier than it starts runs past midnight and belongs to the day it starts. Times follow DST.
- [x] Given a time zone set on the admin page, then the grid, event times and quiet hours use it, whatever the
      server's own zone; an unknown zone is refused.
- [x] Given night mode is set or overridden from the admin page, then the screen follows within a minute.

Verification: automated tests cover config, quiet windows (days, midnight, both DST change days), next event,
alerts, settings edits, time zone (canonical names only) and version, and how they connect (refresh to alerts,
snapshot, `/healthz`, `/api/board` build, saving the time zone). The reload, quiet screen and live switching were checked by hand in the demo. The
image workflow is first run by GitHub on the pull request (build only) and publishes on merge.

## Non-goals
- Turning the physical screen's power off (needs software on the Pi or Home Assistant; planned with spec 003).
- Backups inside the app: the data folder is protected by TrueNAS snapshots (documented in DEPLOY).
- Updating the app from its own admin page.
- Status pages or metrics.

## Plan
1. App version: read from `package.json`; in `/healthz`, `/api/board` and the admin page; board reloads on change. Verify.
2. Image workflow: GHCR build and push; compose and DEPLOY use the image. Verify (workflow lint locally, real run on merge).
3. Backups: document a TrueNAS periodic snapshot task for the data dataset. Verify.
4. Alerts: per-source down/up tracking with a delay; send through the chosen channel; test message button. Verify.
5. Night mode: schedule in config, admin form, board styles. Verify.
6. Docs: DEPLOY (image, updates, backups, alerts), CUSTOMIZE (night selectors). Verify.

## Decisions (answered 2026-11-27)
- Backups: TrueNAS snapshots only; no backup feature in the app.
- Alerts: a Home Assistant webhook (HA then notifies phones). The webhook URL is a secret and lives in config.json.
- Quiet mode: customizable windows per day, parts shown and brightness; default 22:00 to 06:00 every day,
  clock, date and next event at 40%, off until enabled (owner asked for it to be customizable).
- Time zone: set on the admin page (IANA name), applied to the whole process.
- Image: public on GHCR, amd64 and arm64.
- Reload trigger: a hash of the page files, so any change to the page reloads screens even without a version bump.
