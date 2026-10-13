import { V } from '@supershop/shared/validators';
import { ValidationError } from './errors.js';

/** `Idempotency-Key` request header (CLAUDE.md §2.5): 8–100 URL-safe characters. */
const KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;

/** Header value → key, `null` when absent, or a validation error. */
export function parseIdempotencyKey(value) {
  if (value == null || value === '') return null;
  if (!KEY_RE.test(value))
    throw new ValidationError([{ path: 'Idempotency-Key', message: V.CODE_INVALID }]);
  return value;
}
