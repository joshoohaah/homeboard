import { esc, hidden, locker, lockNote } from './admin-settings.js';
import { NIGHT_PARTS, WINDOW_ROWS } from './config.js';

const checked = (on) => (on ? ' checked' : '');
const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
const DOCS = 'https://github.com/joshoohaah/homeboard/blob/main/docs/DEPLOY.md#alerts';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PART_LABELS = { clock: 'Clock', date: 'Date', next: 'Next event', weather: 'Weather now' };

function windowRow(w, i, lock) {
  const days = DAYS.map((d, n) => `<label><input type="checkbox" name="w${i}-d${n}"${checked(w?.days.includes(n))}${lock}> ${d}</label>`).join(' ');
  return `<tr><td>${days}</td>
<td><input type="time" name="w${i}-start" value="${esc(w?.start ?? '')}" aria-label="Window ${i + 1} from"${lock}></td>
<td><input type="time" name="w${i}-end" value="${esc(w?.end ?? '')}" aria-label="Window ${i + 1} until"${lock}></td></tr>`;
}

export function nightHtml(night, token, compose) {
  const lk = locker(compose);
  const rows = Array.from({ length: WINDOW_ROWS }, (_, i) => windowRow(night.windows[i], i, lk('night.windows'))).join('');
  const parts = NIGHT_PARTS.map((p) => `<label><input type="checkbox" name="show-${p}"${checked(night.show.includes(p))}${lk('night.show')}> ${PART_LABELS[p]}</label>`).join(' ');
  return `${lockNote(compose, ['night.enabled', 'night.windows', 'night.show', 'night.brightness'])}
<form method="post" action="/admin/save">${hidden({ token, section: 'night' })}
<label><input type="checkbox" name="enabled"${checked(night.enabled)}${lk('night.enabled')}> Use quiet mode on a schedule</label>
<p><small>A window that ends earlier than it starts runs past midnight and counts for the day it starts. Leave a row's
times empty to skip it.</small></p>
<table class="compact"><thead><tr><th>Days</th><th>From</th><th>Until</th></tr></thead><tbody>${rows}</tbody></table>
<p>Show: ${parts}</p>
<div class="grid">
<label>Brightness (%)<input type="number" name="brightness" min="5" max="100" value="${night.brightness}" required${lk('night.brightness')}></label>
<label>Right now<select name="mode">${option('auto', 'Follow the schedule', night.mode)}${option('on', 'Quiet, until set back', night.mode)}${option('off', 'Normal, until set back', night.mode)}</select></label>
</div>
<button name="action" value="night">Save quiet mode</button></form>`;
}

export function alertsHtml(alerts, token, compose) {
  const lk = locker(compose);
  const state = alerts.webhook ? `A webhook is set (${esc(new URL(alerts.webhook).host)}).` : 'No webhook set: failures only show on the board.';
  return `<p><small>When a calendar or other source fails for longer than the delay, Home Assistant gets one message, and
another when it recovers. <a href="${DOCS}" target="_blank" rel="noreferrer">How to set up the webhook in Home Assistant</a>.</small></p>
<p>${state}</p>
${lockNote(compose, ['alerts.webhook', 'alerts.delayMinutes'])}
<form method="post" action="/admin/save">${hidden({ token, section: 'alerts' })}
<div class="grid">
<label>Webhook URL<input type="url" name="webhook" placeholder="${alerts.webhook ? 'Leave empty to keep the current one' : 'http://homeassistant:8123/api/webhook/…'}" autocomplete="off"${lk('alerts.webhook')}></label>
<label>Alert after (minutes)<input type="number" name="delayMinutes" min="5" max="1440" value="${alerts.delayMinutes}" required${lk('alerts.delayMinutes')}></label>
</div>
<label><input type="checkbox" name="clear"${lk('alerts.webhook')}> Remove the webhook</label>
<button name="action" value="alerts">Save alerts</button>
${alerts.webhook ? '<button name="action" value="alert-test" class="secondary">Send a test alert</button>' : ''}</form>`;
}

/** Every zone the runtime knows, as suggestions; any valid IANA name is accepted. */
export function timeZoneField(current, lock = '') {
  const zones = Intl.supportedValuesOf('timeZone').map((z) => `<option value="${esc(z)}">`).join('');
  return `<label>Time zone<input name="timeZone" list="zones" value="${esc(current)}" required${lock}></label><datalist id="zones">${zones}</datalist>`;
}

/** Where settings come from, without their values (some are secrets). */
export function sourcesHtml(compose) {
  const entries = Object.entries(compose?.sources ?? {});
  const file = compose?.file ? `<code>${esc(compose.file)}</code>` : 'none';
  const rows = entries.map(([path, from]) => `<tr><td><code>${esc(path)}</code></td><td>${esc(from)}</td></tr>`).join('');
  return `<p><small>Compose settings win over this page and are locked here. Config file: ${file}.
Everything else is saved by this page in <code>data/config.json</code>.</small></p>
${rows ? `<table class="compact"><thead><tr><th>Setting</th><th>Set by</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No settings come from compose.</p>'}`;
}
