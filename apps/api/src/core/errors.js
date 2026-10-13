import { ERROR_CODES } from '@supershop/shared';

/**
 * Operational errors with a stable machine `code` (from @supershop/shared) and HTTP status.
 * Throw these from services; the error handler turns them into `{ error: { code, message, details? } }`.
 * `message` is for developers/logs (English); clients localize by `code`.
 */
export class AppError extends Error {
  /**
   * @param {string} code      one of ERROR_CODES
   * @param {string} message
   * @param {{ status?: number, details?: unknown, cause?: unknown }} [opts]
   */
  constructor(code, message, { status = 500, details, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Field-level validation failure. `details` = [{ path, message, code }].
 */
export class ValidationError extends AppError {
  constructor(details = [], message = 'Validation failed') {
    super(ERROR_CODES.VALIDATION_ERROR, message, { status: 400, details });
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) {
    super(ERROR_CODES.BAD_REQUEST, message, { status: 400, details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(ERROR_CODES.UNAUTHENTICATED, message, { status: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(ERROR_CODES.FORBIDDEN, message, { status: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(ERROR_CODES.NOT_FOUND, message, { status: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details) {
    super(ERROR_CODES.CONFLICT, message, { status: 409, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(ERROR_CODES.RATE_LIMITED, message, { status: 429 });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super(ERROR_CODES.SERVICE_UNAVAILABLE, message, { status: 503 });
  }
}

/** Converts zod issues to the API `details` shape. */
export const zodIssuesToDetails = (issues) =>
  issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));

/**
 * Normalizes anything thrown into an AppError. Unknown errors become INTERNAL_ERROR
 * with a generic message so internals never leak to clients.
 * @param {unknown} err
 * @returns {AppError}
 */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  const e = /** @type {any} */ (err) ?? {};

  if (e.name === 'ZodError' && Array.isArray(e.issues)) {
    return new ValidationError(zodIssuesToDetails(e.issues));
  }

  // body-parser (express.json)
  if (e.type === 'entity.parse.failed') {
    return new AppError(ERROR_CODES.INVALID_JSON, 'Malformed JSON body', { status: 400 });
  }
  if (e.type === 'entity.too.large') {
    return new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body too large', { status: 413 });
  }

  // Mongoose: invalid ObjectId / schema validation
  if (e.name === 'CastError') {
    return new BadRequestError(`Invalid value for ${e.path}`, [
      { path: e.path, code: 'invalid_type' },
    ]);
  }
  if (e.name === 'ValidationError' && e.errors && typeof e.errors === 'object') {
    return new ValidationError(
      Object.values(e.errors).map((fe) => ({ path: fe.path, message: fe.message, code: fe.kind })),
    );
  }

  // Mongo duplicate key — report field names only, never the duplicated (possibly PII) value.
  if (e.code === 11000) {
    return new ConflictError('Duplicate value', { fields: Object.keys(e.keyPattern ?? {}) });
  }

  // Other http-errors style client errors (status 4xx with expose=true)
  if (Number.isInteger(e.status) && e.status >= 400 && e.status < 500 && e.expose) {
    return new AppError(ERROR_CODES.BAD_REQUEST, 'Bad request', { status: e.status });
  }

  return new AppError(ERROR_CODES.INTERNAL_ERROR, 'Internal server error', {
    status: 500,
    cause: err,
  });
}
