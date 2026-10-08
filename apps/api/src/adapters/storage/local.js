import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { isSafeKey } from './keys.js';

/** Extensions the static handler will ever serve (all stored media is re-encoded to these). */
const SERVABLE = Object.freeze({ webp: 'image/webp' });
const SERVABLE_PATH_RE = new RegExp(
  `^/(?:[a-z0-9_-]+/)*[a-z0-9_-]+\\.(?:${Object.keys(SERVABLE).join('|')})$`,
);
const ONE_YEAR_SEC = 365 * 24 * 3600;

/**
 * Local-disk storage. Writes are atomic (temp file + rename) so a crash never leaves a half file
 * at a public key. Every path is resolved and checked to stay inside `rootDir`.
 * In production, Nginx should serve `rootDir` at the public URL (same headers as below).
 * @param {{ rootDir: string, publicUrl: string }} opts
 */
export function createLocalStorage({ rootDir, publicUrl }) {
  const root = path.resolve(rootDir);
  const base = publicUrl.replace(/\/+$/, '');

  const fileOf = (key) => {
    if (!isSafeKey(key)) throw new Error('Invalid storage key');
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return file;
  };

  return {
    name: 'local',

    async put(key, body) {
      const file = fileOf(key);
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await writeFile(tmp, body, { flag: 'wx', mode: 0o644 });
        await rename(tmp, file);
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
    },

    async delete(key) {
      try {
        await unlink(fileOf(key));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    },

    url: (key) => `${base}/${key}`,

    /**
     * Serves stored files read-only. Only known image extensions; everything else 404s. Files are
     * immutable (random keys), so they cache for a year. The CSP/sandbox stops a file opened
     * directly from ever running script; CORP allows the storefront/admin origins to embed it.
     */
    staticHandler() {
      const serve = express.static(root, {
        index: false,
        dotfiles: 'deny',
        redirect: false,
        fallthrough: false,
        immutable: true,
        maxAge: ONE_YEAR_SEC * 1000,
        setHeaders(res, filePath) {
          const ext = path.extname(filePath).slice(1);
          res.setHeader('Content-Type', SERVABLE[ext]);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      });
      return (req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || !SERVABLE_PATH_RE.test(req.path)) {
          return next();
        }
        serve(req, res, (err) => {
          // Missing file → fall through to the JSON 404 handler; never leak fs error details.
          if (err && err.status !== 404) return next(err);
          return next();
        });
      };
    },
  };
}
