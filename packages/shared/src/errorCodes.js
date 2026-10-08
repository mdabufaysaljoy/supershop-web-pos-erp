/**
 * Stable, machine-readable API error codes (CLAUDE.md §2.5).
 * Clients map `error.code` → i18n key; never display the server's English `message` to customers.
 * Add new codes here (one place) — never rename or remove an existing code (clients depend on it).
 */
export const ERROR_CODES = Object.freeze({
  // Generic request problems
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  /** Upload whose real content (magic bytes) is not an allowed type, or cannot be decoded. */
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',

  // Auth / access
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  CSRF_FAILED: 'CSRF_FAILED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  BRANCH_SCOPE_DENIED: 'BRANCH_SCOPE_DENIED',
  /** Granting/assigning permissions the actor does not hold. */
  PERMISSION_ESCALATION: 'PERMISSION_ESCALATION',
  /** Changing your own role, status, branches or super-admin flag. */
  CANNOT_MODIFY_SELF: 'CANNOT_MODIFY_SELF',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  ROLE_IN_USE: 'ROLE_IN_USE',
  SYSTEM_ROLE_PROTECTED: 'SYSTEM_ROLE_PROTECTED',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  GONE: 'GONE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  /** URL slug already used by another item of the same kind. */
  SLUG_TAKEN: 'SLUG_TAKEN',
  /** Moving an item under itself/its descendant, or beyond the depth ceiling. */
  INVALID_MOVE: 'INVALID_MOVE',

  // Catalog
  CATEGORY_HAS_CHILDREN: 'CATEGORY_HAS_CHILDREN',
  CATEGORY_IN_USE: 'CATEGORY_IN_USE',
  BRAND_IN_USE: 'BRAND_IN_USE',
  SUPPLIER_IN_USE: 'SUPPLIER_IN_USE',
  /** Another active item already has this name. */
  NAME_TAKEN: 'NAME_TAKEN',
  SKU_TAKEN: 'SKU_TAKEN',
  BARCODE_TAKEN: 'BARCODE_TAKEN',

  // Commerce
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PRICE_CHANGED: 'PRICE_CHANGED',
  CART_EMPTY: 'CART_EMPTY',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_METHOD_UNAVAILABLE: 'PAYMENT_METHOD_UNAVAILABLE',
  REFUND_EXCEEDS_PAID: 'REFUND_EXCEEDS_PAID',
  SHIFT_NOT_OPEN: 'SHIFT_NOT_OPEN',
  LOYALTY_INSUFFICIENT_POINTS: 'LOYALTY_INSUFFICIENT_POINTS',
  EXCHANGE_VALUE_TOO_LOW: 'EXCHANGE_VALUE_TOO_LOW',

  // Throttling / availability
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',

  // Fallback — details are logged server-side, never sent to the client
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});
