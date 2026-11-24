import { PHOTOS_ACCOUNT } from './google.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function accountItem(name, connected, google) {
  if (!google.configured) return `<li><b>${esc(name)}</b>: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.</li>`;
  const link = `<a href="/admin/connect?account=${encodeURIComponent(name)}">${connected ? 'Reconnect' : 'Connect'}</a>`;
  if (!connected) return `<li><b>${esc(name)}</b>: not connected. ${link}</li>`;
  const names = await google.calendars(name).then(
    (l) => l.map((c) => `<li>${esc(c.summaryOverride ?? c.summary)} <code>${esc(c.id)}</code></li>`).join(''),
    (err) => `<li>Could not list calendars: ${esc(err.message)}</li>`);
  return `<li><b>${esc(name)}</b>: connected. ${link}<ul>${names}</ul></li>`;
}

function photosHtml(connected, google, photoImport) {
  if (!google.configured) return '<p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.</p>';
  const link = `<a href="/admin/connect?account=${encodeURIComponent(PHOTOS_ACCOUNT)}">${connected ? 'Reconnect' : 'Connect Google Photos'}</a>`;
  if (!connected) return `<p>${link}</p>`;
  return `<p><a href="/admin/photos" target="_blank">Add photos</a> | <a href="/admin/photos?mode=replace" target="_blank">Replace all imported photos</a> | ${link}</p>
<p>${esc(photoImport.status)} Reload this page for progress.</p>`;
}

export async function adminHtml(board, google, photoImport) {
  const tokens = await google.tokens();
  const accounts = [...new Set(board.config.calendars.filter((c) => c.type === 'google').map((c) => c.account))];
  const items = await Promise.all(accounts.map((a) => accountItem(a, Boolean(tokens[a]), google)));
  const rows = board.status().map((s) => `<tr><td>${esc(s.key)}</td><td>${s.at ? esc(new Date(s.at).toLocaleString()) : 'never'}</td><td>${esc(s.error ?? 'ok')}</td></tr>`);
  return `<!doctype html><meta charset="utf-8"><title>Homeboard admin</title>
<style>body{font:16px system-ui;max-width:60rem;margin:2rem auto;padding:0 1rem}td,th{text-align:left;padding:.3rem 1rem .3rem 0}</style>
<h1>Homeboard</h1><h2>Google accounts</h2><ul>${items.join('') || '<li>None in config.json</li>'}</ul>
<h2>Google Photos</h2>${photosHtml(Boolean(tokens[PHOTOS_ACCOUNT]), google, photoImport)}
<h2>Sources</h2><table><tr><th>Source</th><th>Last good update</th><th>Status</th></tr>${rows.join('')}</table>`;
}
