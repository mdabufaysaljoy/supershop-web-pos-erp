/**
 * Principal registry: the auth module never imports staff/customers. Those modules register an
 * adapter at bootstrap (modules/index.js), keeping dependencies one-way (staff → auth).
 *
 * @typedef {{ id: string, status: 'active' | 'disabled', email?: string | null }} PrincipalRef
 * @typedef {object} PrincipalAdapter
 * @property {(identifier: string) => Promise<PrincipalRef | null>} findByLoginIdentifier
 *   staff: email; customer: email or phone (adapter normalizes)
 * @property {(email: string) => Promise<PrincipalRef | null>} findByEmail
 * @property {(id: string) => Promise<PrincipalRef | null>} findById
 * @property {(id: string) => Promise<object | null>} getProfile  public, safe-to-return profile
 * @property {(id: string) => Promise<void>} [markEmailVerified]
 */

/** @type {Map<string, PrincipalAdapter>} */
const adapters = new Map();

const REQUIRED = ['findByLoginIdentifier', 'findByEmail', 'findById', 'getProfile'];

/**
 * @param {string} type
 * @param {PrincipalAdapter} adapter
 */
export function registerPrincipal(type, adapter) {
  for (const fn of REQUIRED) {
    if (typeof adapter?.[fn] !== 'function')
      throw new Error(`Principal adapter "${type}" is missing ${fn}()`);
  }
  adapters.set(type, adapter);
}

/** @param {string} type */
export function principalAdapter(type) {
  const a = adapters.get(type);
  if (!a) throw new Error(`No principal adapter registered for "${type}"`);
  return a;
}
