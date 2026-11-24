import { PHOTOS_ACCOUNT } from './google.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const STYLE = `:root{color-scheme:light}body{background:#fff;color:#111;font:16px system-ui;max-width:64rem;margin:2rem auto;padding:0 1rem}h2{margin-top:2.5rem}
form{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.35rem 0;border-top:1px solid #ddd}
input,button{font:inherit;padding:.25rem .4rem}input[type=color]{width:3rem;height:2.2rem;padding:.1rem}
input[name=name]{width:13rem}input[name=icon]{width:10rem}input[name=url]{width:20rem}
small{color:#555;flex:1 1 8rem;overflow-wrap:anywhere}td,th{text-align:left;padding:.3rem 1rem .3rem 0}
.pick{min-width:3rem;height:2.2rem;display:grid;place-items:center}.bar{display:flex;gap:.5rem}.bar input{flex:1;min-width:0}
dialog{width:min(44rem,calc(100vw - 2rem));height:min(40rem,calc(100vh - 2rem));border:1px solid #888;border-radius:.5rem}
dialog[open]{display:flex;flex-direction:column;gap:.5rem}.icons{overflow:auto;flex:1}.icons h3{margin:.8rem 0 .3rem;font-size:1rem}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(3rem,1fr));gap:.3rem}.tile{height:3rem;display:grid;place-items:center;cursor:pointer}
.tile.chosen{outline:3px solid #1a5fd0}`;
const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Homeboard admin</title><style>${STYLE}</style>${body}<script type="module" src="/admin/icon-picker.js"></script></html>`;

export const errorHtml = (message) => page(`<h1>Not saved</h1><p>${esc(message)}</p><p><a href="/admin">Back</a></p>`);

const hidden = (fields) => Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('');
const lookInputs = ({ name = '', color = '#4285f4', icon = '' }) =>
  `<input type="color" name="color" value="${esc(color)}" aria-label="Color"><input name="name" value="${esc(name)}" placeholder="Name on the board" aria-label="Name" required maxlength="60"><input name="icon" value="${esc(icon)}" placeholder="Icon (optional)" aria-label="Icon" pattern="[a-z0-9\\-]*">`;
const button = (action, label) => `<button name="action" value="${action}">${label}</button>`;

function sourceText(c) {
  if (c.type === 'google') return `Google: ${c.account}`;
  // Host only: the rest of an iCal link is often a secret.
  return c.type === 'ics' ? `iCal: ${new URL(c.url).host}` : 'Demo';
}

const currentForm = (token) => (c, i) => `<form method="post" action="/admin/calendars">${hidden({ token, was: c.name })}${lookInputs(c)}
<small>${esc(sourceText(c))}</small>${button('update', 'Save')}${i ? button('up', 'Move up') : ''}<details><summary>Remove</summary>${button('remove', 'Yes, remove')}</details></form>`;

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
    return `<form method="post" action="/admin/calendars">${hidden({ token, account: name, calendar: c.id })}
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
<h3>Another account</h3><form action="/admin/connect"><input name="account" placeholder="Short name, e.g. grandma" aria-label="Account name" required pattern="[A-Za-z0-9_\\-]+"><button>Connect</button></form>`;

export async function adminHtml({ board, google, photoImport, token }) {
  const tokens = await google.tokens();
  const { config } = board;
  const accounts = google.configured ? await accountLists(board, google, tokens) : [];
  return page(`<h1>Homeboard</h1><p><a href="/">Open the board</a></p>
<h2>Calendars on the board</h2>${config.calendars.map(currentForm(token)).join('') || '<p>None yet.</p>'}
<h2>Add an iCal link</h2><form method="post" action="/admin/calendars">${hidden({ token })}${lookInputs({})}<input type="url" name="url" placeholder="https:// or webcal:// link" aria-label="iCal link" required>${button('add-ics', 'Add')}</form>
<h2>Google accounts</h2>${google.configured ? googleHtml(accounts, config, token) : '<p>Add google-client.json to the data folder first.</p>'}
<h2>Google Photos</h2>${photosHtml(Boolean(tokens[PHOTOS_ACCOUNT]), google, photoImport)}
<h2>Status</h2>${statusHtml(board)}`);
}
