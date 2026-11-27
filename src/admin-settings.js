import { PRESETS, WIDGETS } from './config.js';
import { compileRules, shorten } from './text.js';
import { timeZoneField } from './admin-ops.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const hidden = (fields) => Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('');
const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
const checked = (on) => (on ? ' checked' : '');

const PRESET_LABELS = { left: 'Side panel on the left', right: 'Side panel on the right', top: 'Top bar', calendar: 'Calendar only' };
const WIDGET_LABELS = {
  clock: 'Clock and date', weather: 'Weather now', aqi: 'Air quality', forecast: '3-day forecast', word: 'Word of the day',
  quote: 'Quote of the day', joke: 'Joke of the day', photos: 'Photos', custom: 'Custom HTML (below)',
};
const DOCS = 'https://github.com/joshoohaah/homeboard/blob/main/docs/CUSTOMIZE.md';

function widgetRows(widgets) {
  return WIDGETS.map((w) => {
    const at = widgets.indexOf(w);
    return `<tr><td><label><input type="checkbox" name="show-${w}"${checked(at >= 0)}> ${WIDGET_LABELS[w]}</label></td>
<td><input type="number" name="order-${w}" value="${at >= 0 ? at + 1 : ''}" min="1" max="20" aria-label="Order of ${WIDGET_LABELS[w]}"></td></tr>`;
  }).join('');
}

export function layoutHtml(config, token) {
  const { layout } = config;
  return `<form method="post" action="/admin/save">${hidden({ token, section: 'layout' })}
<div class="grid">
<label>Layout<select name="preset">${PRESETS.map((p) => option(p, PRESET_LABELS[p], layout.preset)).join('')}</select></label>
<label>Weeks shown<input type="number" name="weeks" min="1" max="6" value="${config.weeks}" required></label>
<label>Week starts on<select name="weekStart">${option('monday', 'Monday', config.weekStart)}${option('sunday', 'Sunday', config.weekStart)}</select></label>
${timeZoneField(config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)}
<label>Times<select name="timeFormat">${option('short', '6p, 12:41p', config.timeFormat)}${option('long', '6:00pm, 12:41pm', config.timeFormat)}</select></label>
</div>
<label><input type="checkbox" name="legend"${checked(layout.legend)}> Show the calendar legend</label>
<p><small>Widgets: tick to show, and number them for their order. Calendar only hides them all.</small></p>
<table class="compact"><tbody>${widgetRows(layout.widgets)}</tbody></table>
<button name="action" value="layout">Save layout</button></form>`;
}

/** One example of what a rule changes on the board right now, if any. */
function example(rule, titles) {
  const [compiled] = compileRules([rule]);
  const hit = titles.slice(0, 500).find(({ calendar, title }) => shorten(title, calendar, [compiled]) !== title);
  return hit ? `<br><small>e.g. "${esc(hit.title)}" becomes "${esc(shorten(hit.title, hit.calendar, [compiled]))}"</small>` : '<br><small>Changes nothing on the board right now.</small>';
}

export function shortenHtml(config, titles, token) {
  const rows = config.shorten.map((r, i) => `<tr><td><code>${esc(r.match)}</code>${r.regex ? ' (pattern)' : ''}${example(r, titles)}</td>
<td>${r.replace ? `<code>${esc(r.replace)}</code>` : '<em>removed</em>'}</td><td>${esc(r.calendar ?? 'all')}</td>
<td><form method="post" action="/admin/save">${hidden({ token, section: 'shorten', index: i })}<button name="action" value="shorten-remove" class="secondary">Remove</button></form></td></tr>`);
  const calendars = config.calendars.map((c) => option(c.name, c.name, '')).join('');
  return `<p><small>Rules run in order on every event title, ignoring case. Leave "Replace with" empty to remove the text.</small></p>
${rows.length ? `<table><thead><tr><th>Find</th><th>Replace with</th><th>Calendar</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}
<form method="post" action="/admin/save" class="row">${hidden({ token, section: 'shorten' })}
<input name="match" placeholder="Find, e.g. Varsity Wrestling - " aria-label="Find" required maxlength="200">
<input name="replace" placeholder="Replace with, e.g. VW " aria-label="Replace with" maxlength="200">
<select name="calendar" aria-label="Calendar"><option value="">All calendars</option>${calendars}</select>
<label><input type="checkbox" name="regex"> Pattern</label>
<button name="action" value="shorten-add">Add rule</button></form>
<p><small>Pattern rules are regular expressions: <code>\\s*\\(\\d\\d:\\d\\d-.*\\)</code> removes a time range in brackets.</small></p>`;
}

export function customHtml(custom, token) {
  const editor = (kind, label, text, hint) => `<form method="post" action="/admin/save">${hidden({ token, section: 'custom' })}
<label>${label}<textarea name="text" rows="10" spellcheck="false" maxlength="50000">${esc(text)}</textarea></label>
<p><small>${hint}</small></p><button name="action" value="custom-${kind}">Save ${label}</button></form>`;
  return `<p><small>Every part of the board has a name to style, and colors and sizes are variables you can change in one place.
See <a href="${DOCS}" target="_blank" rel="noreferrer">the list of parts and variables</a>. Saved changes show on the board within a minute.</small></p>
${editor('css', 'custom.css', custom.css, 'Example: <code>:root { --hb-accent: #1a73e8; }</code> or <code>[data-part="clock"] { font-size: 3rem; }</code>')}
${editor('html', 'custom.html', custom.html, 'Shown in the "Custom HTML" widget. Add <code>&lt;style&gt;</code> for its look. Scripts, forms and links do not run; images must be https.')}`;
}
