import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s)).digest();
export const same = (a, b) => timingSafeEqual(digest(a), digest(b));

export function isAdmin(req, password) {
  const [scheme, value = ''] = (req.headers.authorization ?? '').split(' ');
  if (!password || scheme !== 'Basic') return false;
  const decoded = Buffer.from(value, 'base64').toString();
  return same(decoded.slice(decoded.indexOf(':') + 1), password);
}

const COOKIE = 'homeboard';
// The cookie holds a hash so the key itself is not left on the screen's disk.
const cookieValue = (key) => digest(`display:${key}`).toString('hex');
export const displayCookie = (key, secure) =>
  `${COOKIE}=${cookieValue(key)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export function isDisplay(req, key) {
  if (!key) return true;
  const got = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return Boolean(got) && same(got.slice(COOKIE.length + 1), cookieValue(key));
}
