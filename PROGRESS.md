# Progress log

Append-only handoff log so the next session (human or agent) can pick up
without re-deriving context. Newest entry at the top. Keep entries short.

<!--
Template for each entry:

## YYYY-MM-DD — <short title>
- **Goal:** what this session set out to do (link spec if any)
- **Done:** what changed (files / PRs)
- **Verified:** what `scripts/verify.sh` / manual checks showed
- **Next:** the very next concrete step
- **Traps:** anything surprising that cost time (also add to CLAUDE.md › Gotchas if durable)
-->

## 2026-11-27 — Configuration from compose
- **Goal:** run fully from docker compose (docs/specs/003-compose-configuration.md).
- **Done:** HOMEBOARD_* variables, CONFIG_FILE (YAML/JSON), _FILE secrets, locked fields on the admin page, readable startup errors; README and DEPLOY rewritten; version 0.3.0.
- **Verified:** `bash scripts/verify.sh` (72 tests); built image run with compose: read-only file, variables, Docker secrets, admin save kept compose values out of data/config.json.
- **Next:** switch the real deployment to the compose example.
- **Traps:** CONFIG_FILE changed meaning (now read-only compose); saving must start from the admin layer as read, not the merged config.

## 2026-11-27 — Reliability
- **Goal:** let the board look after itself (docs/specs/002-reliability.md).
- **Done:** screens reload on new page code, GHCR image workflow, HA webhook alerts, customizable quiet mode, time zone setting, snapshot docs; version 0.2.0.
- **Verified:** `bash scripts/verify.sh` (55 tests); reload, quiet screen and time zone checked by hand in the demo.
- **Next:** after merge, check the first image run and make the GHCR package public; switch TrueNAS to the image.
- **Traps:** TZ only understands canonical zone names (Intl accepts more); restarting a preview server also reopens its tab.

## 2026-11-27 — Layouts and custom styling
- **Goal:** fixed 3-week grid, layouts, shorter titles, custom CSS/HTML (docs/specs/001-layouts-and-custom-styling.md).
- **Done:** Open Props tokens in cascade layers, Pico admin, 4 layouts, quote/joke widgets, shorten rules, custom.css/html.
- **Verified:** `bash scripts/verify.sh`; all four layouts, overflow, live layout change and custom files checked by hand in the demo.
- **Next:** deploy; browser behavior has no automated test yet.
- **Traps:** the in-app preview browser blocks iframes (ERR_BLOCKED_BY_CLIENT); check custom HTML in Chrome.

## 2026-11-24 — Calendar management
- **Goal:** manage calendars without editing config.json; load Google's key file.
- **Done:** admin forms (`src/admin*.js`, `src/config-edit.js`), `data/google-client.json`, Google event labels.
- **Verified:** `bash scripts/verify.sh`; add, rename, reorder and remove against a live server and Google account.
- **Next:** deploy with docs/DEPLOY.md; connect a second Google account.
- **Traps:** Google hides event colors from people a calendar is shared with.

## 2026-11-24 — First version
- **Goal:** replace a hosted DAKboard screen.
- **Done:** board, Google and iCal calendars, weather, AQI, word of the day, Google Photos import, container.
- **Verified:** `bash scripts/verify.sh` passes; container starts as user 568. Not yet run with real Google accounts, TrueNAS or a Pi.
- **Next:** deploy with docs/DEPLOY.md.
- **Traps:** Google ends sign-ins after 7 days while the OAuth app is in Testing.
