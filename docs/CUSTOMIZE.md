# Customizing the board

Everything here is on the admin page (`/admin`): **Layout**, **Shorter titles** and **Custom style and HTML**.
Changes show on the board within a minute, without a restart. `custom.css` and `custom.html` can also be edited
or deleted directly in the data folder; the board notices within about a minute.

## Layouts

| Layout | What it does |
|---|---|
| Side panel on the left / right | Widgets stacked in a column; the photo fills what is left |
| Top bar | Widgets in a row across the top, calendar full width below |
| Calendar only | No widgets |

Widgets: clock and date, weather now, air quality, 3-day forecast, word, quote and joke of the day, photos, and your
custom HTML. Tick the ones to show and number them for their order. Weather and air quality sit side by side when they
are next to each other.

The calendar always starts with the current week, Monday or Sunday first, and shows 1 to 6 weeks in rows of equal
height (3 by default). A day with too many events first uses smaller text, then shows the rest as "+N more".

## Shorter titles

Rules run in order on every event title and ignore case. A rule can apply to one calendar or all of them.

| Find | Replace with | Result |
|---|---|---|
| `Varsity Wrestling - ` | `VW ` | "Varsity Wrestling - Dual @ North" → "VW Dual @ North" |
| `No School - ` | `No school: ` | "No School - Winter Break" → "No school: Winter Break" |
| `\s*\(\d\d:\d\d-.*\)` (pattern) | *(empty)* | "Work: 7a12 (07:00-19:30 CST)" → "Work: 7a12" |
| `Work: (\w+)` (pattern) | `Shift $1` | "Work: 7a12" → "Shift 7a12" |

Pattern rules are JavaScript regular expressions; `$1` inserts the first bracketed group. A repeated group inside a
repeat, like `(\w+)+`, is refused because it can freeze the board. Color rules still match the
full title. Times show as `6p` and `12:41p`, or `6:00pm` if you choose the long format.

## custom.css

`custom.css` in the data folder loads after the built-in styles, which sit in cascade layers. Any rule you write wins
without `!important`. Delete the file, or empty it, to go back to the default look.

### Variables

Change one and it changes everywhere it is used. `1rem` is 1% of the screen width.

| Variable | Default | Used for |
|---|---|---|
| `--hb-font` | Montserrat | All text |
| `--hb-text`, `--hb-muted`, `--hb-past` | white, grey, dark grey | Text, week numbers, past days |
| `--hb-bg`, `--hb-calendar-bg` | black, dark gradient | Page and calendar backgrounds |
| `--hb-line`, `--hb-line-width` | light grey, `.07rem` | Grid lines |
| `--hb-accent` | red | Today's circle |
| `--hb-card-bg` | teal | Word, quote and joke cards |
| `--hb-legend-bg`, `--hb-legend-text` | | The legend strip |
| `--hb-radius`, `--hb-gap` | Open Props `--radius-2`, `--size-2` | Corners and spacing |
| `--hb-panel-width` | `23.8rem` | Side panel width |
| `--hb-topbar-height`, `--hb-topbar-photo-width` | `13rem`, `14rem` | Top bar |
| `--hb-clock-size`, `--hb-day-number-size`, `--hb-day-names-size` | | Large type |
| `--hb-event-size`, `--hb-event-size-tight` | `.76rem`, `.66rem` | Events, and events on a busy day |
| `--hb-card-size` | `.68rem` | Card text |
| `--hb-custom-height` | `8rem` | Custom HTML in a side panel |

All of [Open Props](https://open-props.style) (`--size-*`, `--font-size-*`, `--radius-*`, colors such as `--blue-6`)
is available too.

### Parts

| Selector | Element |
|---|---|
| `body[data-layout=left\|right\|top\|calendar]` | The whole board, by layout |
| `[data-part=panel]` | The widget area |
| `[data-part=clock]`, `.time`, `.date` | Clock |
| `[data-part=weather]`, `[data-part=aqi]`, `[data-part=forecast]`, `[data-part=weather-pair]` | Weather |
| `[data-part=word]`, `[data-part=quote]`, `[data-part=joke]`, `.card` | Cards |
| `[data-part=photos]`, `[data-part=custom]` | Photo and custom HTML |
| `[data-part=calendar]`, `[data-part=legend]`, `[data-part=day-names]`, `[data-part=grid]` | Calendar areas |
| `.week`, `.num` | A week row and its number |
| `[data-part=day]`, `[data-date="2026-12-25"]`, `.today`, `.past`, `.tight` | Days |
| `.ev`, `.ev.filled`, `.ev time`, `[data-calendar="Team"]`, `.more` | Events |
| `[data-part=warning]` | The "Not updating" notice |

### Examples

```css
:root { --hb-accent: #1a73e8; --hb-panel-width: 28rem; }   /* blue today, wider panel */
[data-calendar="Team"] { font-weight: 700; }                /* one calendar in bold */
[data-date="2026-12-25"] { background: #2b5d2b; }           /* one day highlighted */
.past { display: none; }                                    /* hide days already gone (keeps the grid) */
[data-layout=top] [data-part=clock] .date { display: none; }
```

## custom.html

Shown in the **Custom HTML** widget. Put a `<style>` element in it for its look. It runs in a sandboxed frame:
scripts, forms and event handlers never run, and only `https:` images and fonts load. It is not affected by
`custom.css`.
