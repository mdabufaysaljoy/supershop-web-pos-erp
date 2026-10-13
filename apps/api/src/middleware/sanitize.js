import { BadRequestError } from '../core/errors.js';

/**
 * Rejects request bodies containing Mongo operator-like keys (`$…`) or dotted keys at any depth
 * (CLAUDE.md §5.1). Defense in depth on top of zod (which strips unknown keys): even a handler
 * that forgets to validate cannot pass `{ "$gt": "" }` into a query.
 * (express-mongo-sanitize is not compatible with Express 5's read-only `req.query`; query strings
 * are already flat via the 'simple' query parser.)
 */
const MAX_DEPTH = 20;

function findUnsafeKey(value, depth = 0) {
  if (depth > MAX_DEPTH) return '(too deep)';
  if (Array.isArray(value)) {
    for (const v of value) {
      const bad = findUnsafeKey(v, depth + 1);
      if (bad) return bad;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) return k;
      const bad = findUnsafeKey(v, depth + 1);
      if (bad) return bad;
    }
  }
  return null;
}

export function rejectUnsafeKeys(req, _res, next) {
  const bad = findUnsafeKey(req.body);
  if (bad)
    return next(
      new BadRequestError('Request body contains a forbidden key', [
        { path: bad, code: 'forbidden_key' },
      ]),
    );
  next();
}
