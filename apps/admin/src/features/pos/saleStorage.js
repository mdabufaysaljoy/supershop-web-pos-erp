/**
 * What a till remembers between page loads (P6.2 revisited).
 *
 * A basket is the cashier's work in progress: reloading the page, walking to another screen, or
 * signing out at the end of a break must not throw it away. It is kept in `localStorage` — per
 * CASHIER and per branch, so two people sharing a terminal never see each other's basket — and
 * restored when they come back.
 *
 * Only what the cashier entered is stored (lines, discounts, who the sale is for, tenders);
 * prices and totals are always the server's, asked for again on restore.
 */
const PREFIX = 'pos';

const safe = (value) => String(value ?? 'anon').replace(/[^\w-]/g, '');

export const cartKey = (staffId, branchId) => `${PREFIX}.cart.${safe(staffId)}.${safe(branchId)}`;
export const heldKey = (staffId) => `${PREFIX}.held.${safe(staffId)}`;

/** localStorage can be unavailable (private mode, full quota) — a till still sells without it. */
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing else depends on this; losing the memory is better than losing the sale.
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * The customer as the SALE endpoint takes it: the mode, who they are, and — when the shop
 * already knows them — their id. Everything the screen keeps for itself (loyalty points, tier,
 * the card number) stays on the screen; the API validates strictly and would refuse it.
 */
export function customerPayload(customer) {
  if (!customer || customer.mode !== 'contact') return { mode: 'walkin' };
  const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
  const out = { mode: 'contact' };
  const customerId = customer.customerId ?? customer.id;
  if (customerId) out.customerId = String(customerId);
  if (trimmed(customer.name)) out.name = trimmed(customer.name);
  if (trimmed(customer.phone)) out.phone = trimmed(customer.phone);
  if (trimmed(customer.email)) out.email = trimmed(customer.email);
  // A contact with nothing to go on is a walk-in, whatever the screen called it.
  return out.customerId || out.phone || out.email ? out : { mode: 'walkin' };
}

/** A held sale, trimmed to what makes it recognisable in the queue. */
export const heldSummary = (entry) => ({
  id: entry.id,
  at: entry.at,
  label: entry.label ?? '',
  lineCount: entry.sale?.lines?.length ?? 0,
  itemCount: (entry.sale?.lines ?? []).reduce((n, line) => n + (line.qty ?? 0), 0),
  /** What the basket came to when it was put aside — the server prices it again on resume. */
  total: entry.total ?? 0,
  customerName: entry.sale?.customer?.mode === 'contact' ? (entry.sale.customer.name ?? '') : '',
  customerPhone: entry.sale?.customer?.phone ?? '',
});
