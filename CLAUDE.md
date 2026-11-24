# CLAUDE.md

> Project instructions for Claude Code. Loaded into every session, so keep it
> short and true (~100 lines). If an instruction is wrong, fix it in the same
> PR that finds the problem. Detail lives in `docs/` and is read when needed.

## Project

- **Name:** homeboard
- **What it does:** Self-hosted family wall calendar: a DAKboard-style screen for Google and iCal calendars, weather and photos
- **Stack:** Node 24 (ES modules, no framework), vanilla browser JS
- **Entry points:** `src/server.js` (server), `public/board.js` (screen), `demo/run.js` (demo)

## Commands

All commands are non-interactive and safe to run from a fresh shell.

| Purpose | Command |
|---------|---------|
| Install deps | `npm ci` |
| **Verify everything** (lint, types, tests) | `bash scripts/verify.sh` |
| Run one test | `node --test test/core.test.js` |
| Run the app locally | `npm run demo` (made-up data) or `npm start` |

`scripts/verify.sh` is the definition of done. It must pass before you say a
task is finished. It prints only failures, so read all of its output.

## Repo map

```
src/            server: board.js collects sources, grid.js lays out weeks
public/         the page the wall screen shows
test/           node:test suites
demo/           invented events; data/ (git-ignored) holds the real setup
docs/DEPLOY.md  TrueNAS, Google and Raspberry Pi steps
docs/specs/     one spec per feature (write before coding non-trivial work)
docs/decisions/ ADRs — why things are the way they are
scripts/        verify.sh and other automation
PROGRESS.md     running handoff log between sessions
```

## How to work here

1. **Start from `PROGRESS.md`.** A SessionStart hook shows you its latest
   entry and the git state; read the spec it points to.
2. **Non-trivial change? Spec first** with `/spec`. Get it agreed before coding.
3. **Small steps.** One change, then `bash scripts/verify.sh`, then the next.
   Don't stack unverified edits.
4. **Tests prove behavior.** New behavior gets a test; bug fixes get a
   regression test that fails before the fix.
5. **Stop and ask** (don't guess) when requirements are ambiguous, an action
   is destructive or irreversible, or you'd need a new dependency or secret.
6. **Before you finish:** `/review` for non-trivial diffs, then `/handoff`.

## Skills and subagents

| Use | When |
|-----|------|
| `/spec <feature>` | Before any change you couldn't describe in one commit message |
| `/verify` | Run verify and fix failures one at a time |
| `/review [base]` | Before a PR: the `reviewer` subagent checks the diff against the spec in a fresh context |
| `/handoff` | End of session: write the `PROGRESS.md` entry |

## Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Branches: `feat/<slug>`, `fix/<slug>`. Never commit directly to `main`.
- Prefer editing existing files over new ones; small files (< 400 lines) and
  small functions (< 50 lines).
- Immutable data and explicit error handling; no silent `catch {}`.
- Every source fails on its own and keeps its last good data.
- The browser gets text only through `textContent`; never `innerHTML`.

## Boundaries

- **Never** commit secrets, `.env` files, or credentials. Use `.env.example`.
- **Never** run destructive commands (`rm -rf`, `git push --force`, DB drops,
  `terraform apply`) without explicit human approval.
- **Never** disable or delete a failing test to make verify pass.
- Do not edit generated files: `package-lock.json` (use npm).

## Gotchas

<!-- Add things that bit Claude (or a human) so it doesn't happen twice. -->
- This repo is public: no real names, addresses, coordinates or schedules in code, tests, demo or docs.
- Day math uses the process time zone; tests import `test/setup.js` first to fix `TZ`.
- The server refuses to start with an https `PUBLIC_URL` and no `DISPLAY_KEY`.

## More context (read when needed)

- `docs/agents/PRINCIPLES.md` — the engineering principles this repo follows
- `docs/agents/WORKFLOW.md` — spec → implement → verify → review → handoff
- `docs/decisions/` — architecture decision records
