/**
 * Stable, machine-readable API error codes (CLAUDE.md §2.5).
 * Clients map `error.code` → i18n key; never display the server's English `message` to customers.
 * Add new codes here (one place) — never rename or remove an existing code (clients depend on it).
 * Domain-specific codes (stock, payment, loyalty…) are appended by later tasks.
 */
export const ERROR_CODES = Object.freeze({
  // Generic request problems
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // Auth / access
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Throttling / availability
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Fallback — details are logged server-side, never sent to the client
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});
