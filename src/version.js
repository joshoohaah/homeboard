import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = (p) => new URL(`../${p}`, import.meta.url);
const PAGE_FILES = ['public/index.html', 'public/board.js', 'public/board.css'];

/**
 * `version` is for people (package version and commit); `build` changes whenever the page itself does,
 * which is what tells wall screens to reload.
 * @returns {Promise<{ version: string, build: string }>}
 */
export async function appVersion(env = process.env) {
  const { version } = JSON.parse(await readFile(root('package.json'), 'utf8'));
  const hash = createHash('sha256');
  for (const file of PAGE_FILES) hash.update(await readFile(root(file)));
  const commit = /^[0-9a-f]{7,40}$/.test(env.HOMEBOARD_COMMIT ?? '') ? `+${env.HOMEBOARD_COMMIT.slice(0, 7)}` : '';
  return { version: `${version}${commit}`, build: hash.digest('hex').slice(0, 12) };
}
