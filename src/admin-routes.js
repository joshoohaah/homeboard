import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { isAdmin, same } from './auth.js';
import { adminHtml, errorHtml } from './admin.js';
import { iconIndex } from './icons.js';
import { PHOTOS_ACCOUNT } from './google.js';

const FAILED_LOGIN_DELAY_MS = 1000;
const MAX_BODY = 10_000;
const HTML = 'text/html; charset=utf-8';

async function readForm(req) {
  let body = '';
  for await (const chunk of req.setEncoding('utf8')) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error('That form is too large');
  }
  return Object.fromEntries(new URLSearchParams(body));
}

export function createAdmin({ board, google, photoImport, store, env, log, send, sendFile, redirect }) {
  // Browsers resend Basic credentials on their own, so a form must also carry this.
  const token = randomBytes(24).toString('base64url');

  async function callback(res, url) {
    const code = url.searchParams.get('code');
    if (!code) return send(res, 400, 'Google sign-in was cancelled.');
    try { await google.finish(code, url.searchParams.get('state')); } catch (err) {
      log('google sign-in:', err.message);
      return send(res, 400, `Google sign-in failed: ${err.message}`);
    }
    board.refreshSoon();
    return redirect(res, '/admin');
  }

  async function pickPhotos(res, url) {
    try {
      return redirect(res, await photoImport.start(url.searchParams.get('mode') === 'replace'));
    } catch (err) {
      log('photo import:', err.message);
      return send(res, 502, `Could not open Google Photos: ${err.message}`);
    }
  }

  function connect(res, url) {
    const account = url.searchParams.get('account') ?? '';
    const valid = account === PHOTOS_ACCOUNT || /^[\w-]{1,40}$/.test(account);
    return valid && google.configured ? redirect(res, google.authUrl(account)) : send(res, 400, 'That account name cannot be used');
  }

  async function edit(req, res) {
    try {
      const { token: sent, action, ...fields } = await readForm(req);
      if (!same(sent ?? '', token)) return send(res, 403, errorHtml('This page was out of date. Go back, reload it and try again.'), HTML);
      await store.apply(action, fields);
    } catch (err) {
      log('calendar edit:', err.message);
      return send(res, 400, errorHtml(err.message.replace(/^config\.json: /, '')), HTML);
    }
    board.refreshSoon();
    return redirect(res, '/admin', { }, 303);
  }

  return async function admin(req, res, url) {
    if (!env.ADMIN_PASSWORD) return send(res, 403, 'Set ADMIN_PASSWORD to use the admin page.');
    if (!isAdmin(req, env.ADMIN_PASSWORD)) {
      if (req.headers.authorization) await sleep(FAILED_LOGIN_DELAY_MS);
      return send(res, 401, 'Sign in required', undefined, { 'www-authenticate': 'Basic realm="Homeboard", charset="UTF-8"' });
    }
    if (req.method === 'POST') return url.pathname === '/admin/calendars' ? edit(req, res) : send(res, 405, 'Method not allowed');
    if (url.pathname === '/admin') return send(res, 200, await adminHtml({ board, google, photoImport, token }), HTML);
    if (url.pathname === '/admin/icon-picker.js') return sendFile(res, ['public/icon-picker.js', 'text/javascript']);
    if (url.pathname === '/admin/icons.json') return send(res, 200, JSON.stringify(await iconIndex()), 'application/json', { 'cache-control': 'private, max-age=86400' });
    if (url.pathname === '/admin/oauth/callback') return callback(res, url);
    if (url.pathname === '/admin/photos') return pickPhotos(res, url);
    if (url.pathname === '/admin/connect') return connect(res, url);
    return send(res, 404, 'Not found');
  };
}
