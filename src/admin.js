import { PHOTOS_ACCOUNT } from './google.js';
import { esc, hidden, layoutHtml, shortenHtml, customHtml } from './admin-settings.js';
// Pico styles the page by its HTML; these rules only fit the compact rows and the icon picker.
const STYLE = `body>main{max-width:72rem;margin:0 auto;padding:1.5rem 1rem}h2{margin-top:2.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:0 1rem}
form.row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.4rem 0;margin:0;border-top:1px solid var(--pico-muted-border-color)}
form.row :is(input,select,button){width:auto;margin:0}form.row label{margin:0}form.row details{margin:0}
form.row input[type=color]{width:3rem;height:2.6rem;padding:.15rem}form.row input[name=name]{width:13rem}form.row input[name=url]{flex:1;min-width:14rem}
form.row small{flex:1 1 8rem;overflow-wrap:anywhere}table.compact{width:auto}table.compact input[type=number]{width:5rem;margin:0}
.pick{min-width:3rem;height:2.6rem;padding:0 .5rem;display:grid;place-items:center}
dialog article{width:min(44rem,calc(100vw - 2rem));height:min(40rem,calc(100vh - 2rem));display:flex;flex-direction:column;gap:.5rem;margin:0}
.bar{display:flex;gap:.5rem}.bar input{flex:1;min-width:0;margin:0}.bar button{width:auto;margin:0}
.icons{overflow:auto;flex:1}.icons h3{margin:.8rem 0 .3rem;font-size:1rem}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(3rem,1fr));gap:.3rem}
.tile{height:3rem;padding:0;display:grid;place-items:center;background:var(--pico-form-element-background-color);border-color:var(--pico-form-element-border-color)}
.tile.chosen{outline:3px solid var(--pico-primary)}
@media (prefers-color-scheme:dark){.tile img,.pick img{filter:invert(1)}}`;
const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Homeboard admin</title><link rel="stylesheet" href="/admin/pico.css"><style>${STYLE}</style><main>${body}</main><script type="module" src="/admin/icon-picker.js"></script></html>`;

export const errorHtml = (message) => page(`<h1>Not saved</h1><p>${esc(message)}</p><p><a href="/admin">Back</a></p>`);

const lookInputs = ({ name = '', color = '#4285f4', icon = '' }) =>
  `<input type="color" name="color" value="${esc(color)}" aria-label="Color"><input name="name" value="${esc(name)}" placeholder="Name on the board" aria-label="Name" required maxlength="60"><input name="icon" value="${esc(icon)}" placeholder="Icon (optional)" aria-label="Icon" pattern="[a-z0-9\\-]*">`;
const button = (action, label, kind = '') => `<button name="action" value="${action}"${kind ? ` class="${kind}"` : ''}>${label}</button>`;

function sourceText(c) {
  if (c.type === 'google') return `Google: ${c.account}`;
  // Host only: the rest of an iCal link is often a secret.
  return c.type === 'ics' ? `iCal: ${new URL(c.url).host}` : 'Demo';
}

const currentForm = (token) => (c, i) => `<form method="post" action="/admin/save" class="row">${hidden({ token, was: c.name })}${lookInputs(c)}
<small>${esc(sourceText(c))}</small>${button('update', 'Save')}${i ? button('up', 'Move up') : ''}<details><summary>Remove</summary>${button('remove', 'Yes, remove', 'secondary')}</details></form>`;

/** Calendar lists of every connected account, with a message for any that fail. */
async function accountLists(board, google, tokens) {
  const names = [...new Set([
    ...board.config.calendars.filter((c) => c.type === 'google').map((c) => c.account),
    ...Object.keys(tokens).filter((k) => k !== PHOTOS_ACCOUNT),
  ])];
  return Promise.all(names.map(async (name) => {
    if (!tokens[name]) return { name, connected: false, list: [] };
    try { return { name, connected: true, list: await google.calendars(name) }; } catch (err) {
      return { name, connected: true, list: [], error: err.message };
    }
  }));
}

function accountHtml({ name, connected, list, error }, config, token) {
  const link = `<a href="/admin/connect?account=${encodeURIComponent(name)}">${connected ? 'Reconnect' : 'Connect'}</a>`;
  const used = new Set(config.calendars.filter((c) => c.account === name).map((c) => c.calendar));
  const taken = new Set(config.calendars.map((c) => c.name));
  const free = list.filter((c) => !used.has(c.id) && !used.has(c.summary) && !used.has(c.summaryOverride));
  const rows = free.map((c) => {
    const title = c.summaryOverride ?? c.summary;
    const color = /^#[0-9a-f]{6}$/i.test(c.backgroundColor ?? '') ? c.backgroundColor : undefined;
    return `<form method="post" action="/admin/save" class="row">${hidden({ token, account: name, calendar: c.id })}
${lookInputs({ name: taken.has(title) ? `${title} (${name})` : title, color })}<small>${esc(title)}</small>${button('add-google', 'Add')}</form>`;
  });
  const state = connected ? `connected${error ? `, but its calendars could not be listed: ${esc(error)}` : ''}` : 'not connected';
  const body = rows.length ? `<details><summary>${rows.length} calendars to add</summary>${rows.join('')}</details>` : '';
  return `<h3>${esc(name)}</h3><p>${state}. ${link}</p>${body}`;
}

function photosHtml(connected, google, photoImport) {
  if (!google.configured) return '<p>Add google-client.json to the data folder first.</p>';
  const link = `<a href="/admin/connect?account=${encodeURIComponent(PHOTOS_ACCOUNT)}">${connected ? 'Reconnect' : 'Connect Google Photos'}</a>`;
  if (!connected) return `<p>${link}</p>`;
  return `<p><a href="/admin/photos" target="_blank">Add photos</a> | <a href="/admin/photos?mode=replace" target="_blank">Replace all imported photos</a> | ${link}</p>
<p>${esc(photoImport.status)} Reload this page for progress.</p>`;
}

function statusHtml(board) {
  const rows = board.status().map((s) => {
    const state = s.error ?? (s.at ? 'ok' : 'loading');
    return `<tr><td>${esc(s.key.replace(/^cal:/, ''))}</td><td>${s.at ? esc(new Date(s.at).toLocaleString()) : 'never'}</td><td>${esc(state)}</td></tr>`;
  });
  return `<table><tr><th>Source</th><th>Last good update</th><th>Status</th></tr>${rows.join('')}</table>`;
}

const googleHtml = (accounts, config, token) => `${accounts.map((a) => accountHtml(a, config, token)).join('')}
<h3>Another account</h3><form action="/admin/connect" class="row"><input name="account" placeholder="Short name, e.g. grandma" aria-label="Account name" required pattern="[A-Za-z0-9_\\-]+"><button>Connect</button></form>`;

export async function adminHtml({ board, google, photoImport, custom, token }) {
  const tokens = await google.tokens();
  const { config } = board;
  const accounts = google.configured ? await accountLists(board, google, tokens) : [];
  return page(`<h1>Homeboard</h1><p><a href="/">Open the board</a></p>
<h2 id="calendars">Calendars on the board</h2>${config.calendars.map(currentForm(token)).join('') || '<p>None yet.</p>'}
<h2>Add an iCal link</h2><form method="post" action="/admin/save" class="row">${hidden({ token })}${lookInputs({})}<input type="url" name="url" placeholder="https:// or webcal:// link" aria-label="iCal link" required>${button('add-ics', 'Add')}</form>
<h2>Google accounts</h2>${google.configured ? googleHtml(accounts, config, token) : '<p>Add google-client.json to the data folder first.</p>'}
<h2 id="layout">Layout</h2>${layoutHtml(config, token)}
<h2 id="shorten">Shorter titles</h2>${shortenHtml(config, board.titles(), token)}
<h2 id="custom">Custom style and HTML</h2>${customHtml(custom, token)}
<h2>Google Photos</h2>${photosHtml(Boolean(tokens[PHOTOS_ACCOUNT]), google, photoImport)}
<h2>Status</h2>${statusHtml(board)}`);
}
