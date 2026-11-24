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

## 2026-11-24 — First version
- **Goal:** replace a hosted DAKboard screen.
- **Done:** board, Google and iCal calendars, weather, AQI, word of the day, Google Photos import, container.
- **Verified:** `bash scripts/verify.sh` passes; container starts as user 568. Not yet run with real Google accounts, TrueNAS or a Pi.
- **Next:** deploy with docs/DEPLOY.md.
- **Traps:** Google ends sign-ins after 7 days while the OAuth app is in Testing.
