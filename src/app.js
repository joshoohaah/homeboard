import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDisplay, displayCookie, same } from './auth.js';
import { createAdmin } from './admin-routes.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const iconPath = (name) => `node_modules/@mdi/svg/svg/${name}.svg`;
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
// The admin page must not be framed by another site; the board may be (for example in Home Assistant).
const ADMIN_HEADERS = { 'x-frame-options': 'DENY' };

export const iconExists = async (name) =>
  /^[a-z0-9-]+$/.test(name) && access(root(iconPath(name))).then(() => true, () => false);

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { ...HEADERS, 'cache-control': 'no-store', 'content-type': type, ...extra });
  res.end(body);
}
const redirect = (res, location, extra = {}, code = 302) => send(res, code, '', 'text/plain', { location, ...extra });
const sendFile = async (res, [path, type], cache = 'no-cache') =>
  send(res, 200, await readFile(root(path)), type, { 'cache-control': cache });
const sendAdmin = (res, code, body, type, extra = {}) => send(res, code, body, type, { ...ADMIN_HEADERS, ...extra });

export function createApp({ board, photos, google, photoImport, store, env, log = console.error }) {
  const admin = createAdmin({ board, google, photoImport, store, env, log, send: sendAdmin, redirect });

  async function display(res, pathname) {
    if (STATIC[pathname]) return sendFile(res, STATIC[pathname]);
    if (pathname === '/api/board') return send(res, 200, JSON.stringify(board.snapshot()), 'application/json');
    const icon = pathname.match(/^\/icons\/([a-z0-9-]+)\.svg$/)?.[1];
    if (icon) return sendFile(res, [iconPath(icon), 'image/svg+xml'], 'max-age=86400');
    const photo = pathname.match(/^\/photos\/([0-9a-f]{16})$/)?.[1];
    const image = photo && await photos.render(photo);
    if (image) return send(res, 200, image, 'image/jpeg', { 'cache-control': 'private, max-age=3600' });
    return send(res, 404, 'Not found');
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
    if (!['GET', 'HEAD'].includes(req.method) && !(isAdminPath && req.method === 'POST')) return send(res, 405, 'Method not allowed');
    if (pathname === '/healthz') return send(res, 200, 'ok');
    if (isAdminPath) return admin(req, res, url);

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
