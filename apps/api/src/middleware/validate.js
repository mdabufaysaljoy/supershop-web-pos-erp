import { ValidationError, zodIssuesToDetails } from '../core/errors.js';

/**
 * Validates request parts with zod schemas (CLAUDE.md §5.3) and exposes the parsed, typed,
 * unknown-key-stripped values as `req.valid.{params,query,body}`. Handlers must read from
 * `req.valid`, never from raw `req.body`/`req.query`.
 * Issues from all parts are collected and returned together as field-level `details`.
 *
 * A part may be a schema OR a function `(req) => schema` — used when the schema depends on
 * admin settings (e.g. password policy), so changes apply without a restart.
 *
 * @typedef {import('zod').ZodType | ((req: import('express').Request) => import('zod').ZodType)} SchemaOrFactory
 * @param {{ params?: SchemaOrFactory, query?: SchemaOrFactory, body?: SchemaOrFactory }} schemas
 */
export function validate(schemas) {
  return function validateRequest(req, _res, next) {
    const valid = {};
    const details = [];
    for (const part of /** @type {const} */ (['params', 'query', 'body'])) {
      const given = schemas[part];
      if (!given) continue;
      const schema = typeof given === 'function' ? given(req) : given;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        valid[part] = result.data;
      } else {
        const prefix = part === 'body' ? '' : `${part}.`;
        details.push(
          ...zodIssuesToDetails(result.error.issues).map((d) => ({ ...d, path: prefix + d.path })),
        );
      }
    }
    if (details.length) return next(new ValidationError(details));
    req.valid = valid;
    next();
  };
}
