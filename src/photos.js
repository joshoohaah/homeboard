import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const TYPES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const MAX_PX = 1200;

// Both folders are optional, so a missing one is just empty.
async function listFolder(dir) {
  try { return await readdir(dir, { recursive: true, withFileTypes: true }); } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export class Photos {
  #byId = new Map();

  constructor(dirs) { this.dirs = [dirs].flat().filter(Boolean); }

  /** IDs are hashes of known files, so a request can never name a path. */
  async scan() {
    const lists = await Promise.all(this.dirs.map(listFolder));
    const entries = lists.flat();
    this.#byId = new Map(entries
      .filter((e) => e.isFile() && !e.name.startsWith('.') && TYPES.has(extname(e.name).toLowerCase()))
      .map((e) => join(e.parentPath, e.name))
      .map((path) => [createHash('sha256').update(path).digest('hex').slice(0, 16), path]));
    return this.ids();
  }
  ids() { return [...this.#byId.keys()]; }

  async render(id) {
    const path = this.#byId.get(id);
    if (!path) return null;
    try {
      return await sharp(path).rotate().resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toBuffer();
    } catch (err) {
      console.warn(`photo ${path}: ${err.message}`);
      return null;
    }
  }
}
