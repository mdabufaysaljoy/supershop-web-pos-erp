import { NotFoundError, toAppError } from './errors.js';

/**
 * Response envelope helpers (CLAUDE.md §2.5): success `{ data, meta? }`.
 * Controllers use these instead of `res.json` so the shape stays uniform.
 */
export function sendData(res, data, { status = 200, meta } = {}) {
  return res.status(status).json(meta === undefined ? { data } : { data, meta });
}

export const sendCreated = (res, data, meta) => sendData(res, data, { status: 201, meta });

export const sendNoContent = (res) => res.status(204).end();

/** Final 404 for unmatched routes. */
export function notFoundHandler(_req, _res, next) {
  next(new NotFoundError('Route not found'));
}

/**
 * Central error handler: `{ error: { code, message, details?, requestId } }`.
 * 5xx: generic message to the client, full error attached to the request log line.
 */
// Express identifies error middleware by its 4-arg signature, so `_next` must stay.
export function errorHandler(err, req, res, _next) {
  const appErr = toAppError(err);

  if (res.headersSent) {
    req.log?.error({ err }, 'error after headers were sent');
    res.destroy();
    return;
  }

  if (appErr.status >= 500) {
    // pino-http includes `res.err` in its completion log line.
    res.err = err instanceof Error ? err : new Error(String(err));
  }

  const body = { code: appErr.code, message: appErr.message };
  if (appErr.details !== undefined) body.details = appErr.details;
  if (req.id !== undefined) body.requestId = String(req.id);

  if ((appErr.status === 503 || appErr.status === 429) && !res.getHeader('Retry-After')) {
    res.setHeader('Retry-After', '30');
  }
  res.status(appErr.status).json({ error: body });
}
