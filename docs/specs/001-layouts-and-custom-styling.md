# 001 — Layouts and custom styling

- **Status:** done
- **Owner:** repo owner
- **Issue/PR:** —

## Problem
The board has one hard-coded arrangement: a left side panel and a 6-week grid whose rows grow with their
content. On a busy month the later weeks are cut off at the bottom of the screen, so the family cannot rely
on seeing the next two weeks. Changing the arrangement, or the look of one element, means editing the
shipped CSS and JavaScript, which an update then overwrites. The styling is hand-written values with no
shared scale, so small changes ripple unpredictably.

## Acceptance criteria
- [x] Given the default config, when the board loads on any day, then it shows exactly 3 rows: the current
      week (Monday to Sunday by default) and the 2 weeks after it, filling the calendar area in equal-height rows.
- [x] Given a day with more events than fit its cell, then the cell shows what fits followed by "+N more",
      and no row grows or pushes another off screen.
- [x] Given `calendar.weeks` set to 1–6 (default 3), then that many fixed rows are shown, current week first.
- [x] Given a `layout` choice (side panel left, right, or none; legend on or off), when it is saved on the
      admin page, then the board rearranges within a minute without a restart or reload by hand.
- [x] Given each widget (clock, weather, air quality, forecast, word, quote, joke, photos, custom HTML) and the legend can be
      switched on or off and ordered within the side panel, then the change shows within a minute.
- [x] Given `data/custom.css` exists, then it loads after the built-in styles and any rule in it wins,
      without `!important`; deleting it restores the default look.
- [x] Given every element has a stable, documented hook (`data-part="clock"`, `data-part="day"`, `.today`,
      `.past`, `data-calendar="<name>"` on events), then one CSS rule can restyle one element or one calendar.
- [x] Given the look is defined by design tokens (colors, spacing, type scale, radius) as CSS variables,
      then changing one variable in `custom.css` changes it everywhere it is used.
- [x] Given a custom HTML block is added on the admin page, then it shows in its slot; `<script>`, event
      handler attributes and `javascript:` links never run (blocked by the page's security policy, not only
      by filtering).
- [x] Given `custom.css` is edited on the admin page, when saved, then the board shows it within a minute.
- [x] Given `custom.css` fails to load, then the board still renders with the default look.

Verification: server behavior (config, snapshot, saving, files, security headers, the display key) has automated
tests. Browser behavior ("+N more", fixed rows, live layout changes, custom.css winning, the sandboxed frame) was
checked by hand in the demo at 1920x1080 in all four layouts; it has no automated test.

## Non-goals
- A drag-and-drop canvas editor with free positioning (Home Screens style).
- More than one screen or rotating screens (later phase).
- Running custom JavaScript on the board.
- Day, agenda or month views; only the week grid is in scope.
- A build step (Tailwind, Sass, bundler): the board stays plain files.

## Plan
1. Design tokens: move board colors, sizes and spacing to CSS variables in `@layer base`; add `data-part`
   hooks. No visual change. Verify.
2. Fixed grid: `calendar.weeks` (default 3) in config; equal rows; "+N more" overflow measured in the
   browser. Tests for the week range at month and year ends. Verify.
3. `custom.css` from the data folder, loaded last; served only with the display cookie. Verify.
4. `layout` config (side panel position, widgets on/off and order), drawn with CSS grid areas; admin form. Verify.
5. Custom HTML blocks and the `custom.css` editor on the admin page. Verify.
6. Framework (see open questions) applied to the admin page. Verify.
7. Docs: a "Customize" section listing every hook and token, with examples. Verify.

## Design notes
- Built-in CSS sits in cascade layers (`@layer base, layout, theme`); `custom.css` is unlayered, so its
  rules beat built-in ones by cascade order rather than specificity.
- The board already polls `/api/board` every minute; layout and a `custom.css` version ride along in that
  response, so changes need no reload.
- Overflow: render all events, then hide the ones past the cell bottom and add "+N more" (measured after
  layout, redone on resize and on each update).
- The content security policy keeps `script-src 'self'`, so custom HTML cannot run script even if a filter misses something.

## Decisions (answered 2026-11-27)
- Framework: Open Props tokens for the board, Pico CSS (classless) for the admin page.
- Weeks start on Monday by default (Sunday is a setting); 3 weeks by default, 1-6 allowed.
- Past days of the current week stay visible and dimmed.
- Busy days: smaller text first, then "+N more". Times are short (`6p`) by default. Titles can be shortened with
  find-and-replace rules (plain text or patterns), per calendar or for all.
- Layouts: side panel left, right, top bar and calendar only. Added widgets: quote of the day (ZenQuotes, credited)
  and joke of the day (JokeAPI, safe mode).
- Custom HTML runs in a sandboxed frame with its own strict policy; no frames of other sites yet.
