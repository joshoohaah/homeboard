# 003 — Configuration from docker compose

- **Status:** done
- **Owner:** repo owner
- **Issue/PR:** —

## Problem
Homeboard runs only as a container, but almost every setting lives in `data/config.json`, which is edited on the
admin page or by hand inside the data volume. The owner wants the deployment itself, a compose file and the files it
mounts, to say how the board is set up, so it can be reviewed, versioned and rebuilt without clicking through the
admin page. Secrets in compose should not have to sit in plain environment variables.

## Acceptance criteria
- [x] Given `HOMEBOARD_*` environment variables (time zone, location, weeks, week start, time format, layout,
      widgets, legend, quiet mode, alerts, refresh and photo timing), then they set those settings.
- [x] Given `CONFIG_FILE` pointing to a YAML or JSON file (which may be mounted read-only), then every setting in it
      applies, including calendars, color rules and shortening rules.
- [x] Given the same setting in several places, then environment beats the file, the file beats what the admin page
      saved, and that beats the built-in default.
- [x] Given a setting comes from compose, then the admin page shows it as set in compose and cannot change it; other
      settings stay editable and are saved to `data/config.json`. Calendars, color rules and shortening rules lock
      as a whole when the file defines them.
- [x] Given a compose value is removed, then on restart the admin-saved or default value applies again.
- [x] Given `ADMIN_PASSWORD_FILE`, `DISPLAY_KEY_FILE`, `GOOGLE_CLIENT_SECRET_FILE` or
      `HOMEBOARD_ALERTS_WEBHOOK_FILE`, then the secret is read from that file (Docker secrets); setting both a
      variable and its `_FILE` is an error.
- [x] Given an invalid variable or file, then the container stops at start with a message naming the variable or
      file and what was expected, and never prints secret values.
- [x] Given no `CONFIG_FILE` and no `HOMEBOARD_*` variables, then everything works as before.
- [x] Given `CONFIG_FILE` points at `data/config.json` itself, then it is treated as the admin file, not as compose.

## Non-goals
- Variables inside the config file (compose already substitutes `${VAR}` in its own YAML).
- Defining calendars as environment variables.
- Watching the config file for changes; a restart applies compose changes, as for any container.
- Custom CSS and HTML from compose (they already live in mountable files in the data folder).

## Plan
1. Settings sources: parse `HOMEBOARD_*` and `_FILE` secrets; read the YAML/JSON file; deep-merge layers; record
   which setting paths are locked and where they came from. Tests. Verify.
2. Startup and saving: effective config = defaults < admin file < config file < environment; saving writes only the
   admin layer and keeps locked values. Tests. Verify.
3. Admin page: locked fields shown disabled with "set in compose"; a Configuration section listing the sources. Tests. Verify.
4. Compose example, `config.example.yaml`, DEPLOY and CUSTOMIZE. Verify.
5. Build the image and run it with a compose-style setup (read-only file, variables, a secret file). Verify.

## Decisions (answered 2026-11-27)
- Compose wins and is shown locked on the admin page.
- File format: YAML or JSON (adds the `yaml` package).
- Calendars, color rules and shortening rules are defined in the file, not in variables.
- `TZ` still sets the server's fallback zone; only `HOMEBOARD_TIMEZONE` locks the board's time zone.
