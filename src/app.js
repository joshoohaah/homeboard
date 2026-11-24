import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAdmin, isDisplay, displayCookie, same } from './auth.js';
import { PHOTOS_ACCOUNT } from './google.js';
import { adminHtml } from './admin.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/board.css': ['public/board.css', 'text/css'],
  '/board.js': ['public/board.js', 'text/javascript'],
  '/font.woff2': ['node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2', 'font/woff2'],
};
const FAILED_LOGIN_DELAY_MS = 1000;
const HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
};

export function createApp({ board, photos, google, photoImport, env, log = console.error }) {
  const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    res.writeHead(code, { ...HEADERS, 'cache-control': 'no-store', 'content-type': type, ...extra });
    res.end(body);
  };
  const redirect = (res, location, extra = {}) => send(res, 302, '', 'text/plain', { location, ...extra });
  const sendFile = async (res, [path, type], cache = 'no-cache') =>
    send(res, 200, await readFile(root(path)), type, { 'cache-control': cache });

  async function callback(res, url) {
    const code = url.searchParams.get('code');
    if (!code) return send(res, 400, 'Google sign-in was cancelled.');
    try { await google.finish(code, url.searchParams.get('state')); } catch (err) {
      log('google sign-in:', err.message);
      return send(res, 400, `Google sign-in failed: ${err.message}`);
    }
    board.refresh().catch((err) => log('refresh:', err.message));
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

  async function admin(req, res, url) {
    if (!env.ADMIN_PASSWORD) return send(res, 403, 'Set ADMIN_PASSWORD to use the admin page.');
    if (!isAdmin(req, env.ADMIN_PASSWORD)) {
      if (req.headers.authorization) await sleep(FAILED_LOGIN_DELAY_MS);
      return send(res, 401, 'Sign in required', undefined, { 'www-authenticate': 'Basic realm="Homeboard", charset="UTF-8"' });
    }
    if (url.pathname === '/admin') return send(res, 200, await adminHtml(board, google, photoImport), 'text/html; charset=utf-8');
    if (url.pathname === '/admin/oauth/callback') return callback(res, url);
    if (url.pathname === '/admin/photos') return pickPhotos(res, url);
    if (url.pathname === '/admin/connect') {
      const account = url.searchParams.get('account') ?? '';
      const known = account === PHOTOS_ACCOUNT || board.config.calendars.some((c) => c.type === 'google' && c.account === account);
      return known && google.configured ? redirect(res, google.authUrl(account)) : send(res, 400, 'Unknown account');
    }
    return send(res, 404, 'Not found');
  }

  async function display(res, pathname) {
    if (STATIC[pathname]) return sendFile(res, STATIC[pathname]);
    if (pathname === '/api/board') return send(res, 200, JSON.stringify(board.snapshot()), 'application/json');
    const icon = pathname.match(/^\/icons\/([a-z0-9-]+)\.svg$/)?.[1];
    if (icon) return sendFile(res, [`node_modules/@mdi/svg/svg/${icon}.svg`, 'image/svg+xml'], 'max-age=86400');
    const photo = pathname.match(/^\/photos\/([0-9a-f]{16})$/)?.[1];
    const image = photo && await photos.render(photo);
    if (image) return send(res, 200, image, 'image/jpeg', { 'cache-control': 'private, max-age=3600' });
    return send(res, 404, 'Not found');
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (pathname === '/healthz') return send(res, 200, 'ok');
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return admin(req, res, url);

    const key = env.DISPLAY_KEY;
    if (key && pathname === '/' && url.searchParams.has('key')) {
      if (!same(url.searchParams.get('key'), key)) {
        await sleep(FAILED_LOGIN_DELAY_MS);
        return send(res, 403, 'Wrong key');
      }
      return redirect(res, '/', { 'set-cookie': displayCookie(key, (env.PUBLIC_URL ?? '').startsWith('https:')) });
    }
    if (!isDisplay(req, key)) return send(res, 403, 'Open this board with its ?key= link first.');
    return display(res, pathname);
  }

  return createServer((req, res) => route(req, res).catch((err) => {
    if (err.code === 'ENOENT') return send(res, 404, 'Not found');
    log(`${req.method} ${req.url.split('?')[0]}:`, err.message);
    return send(res, 500, 'Server error');
  }));
}
