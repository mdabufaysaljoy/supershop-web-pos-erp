import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const readJson = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;

/** Stable, prettier-compatible JSON (2 spaces, trailing newline). */
export const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

export function catalogPaths(catalog, lang) {
  const dir = path.join(ROOT, catalog.dir);
  return { file: path.join(dir, `${lang}.json`), lock: path.join(dir, 'i18n.lock.json') };
}

/** All .js/.jsx files under `dir` (skipping tests and build output). */
export function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (['node_modules', '.next', 'dist', '__tests__'].includes(name)) continue;
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}
