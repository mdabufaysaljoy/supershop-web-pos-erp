/**
 * Permission registry (CLAUDE.md §5.2). Keys are `resource.action`.
 * Roles are DB data (arrays of these keys); the server checks them with `requirePermission(key)`
 * and the admin UI hides what `can(key)` denies. Deny by default.
 *
 * Adding a permission = add it here (one place). Never rename/remove a key that roles may already
 * store — deprecate instead. Labels in the admin UI come from i18n key `permissions.<key>`.
 */
const GROUPS = {
  dashboard: ['dashboard.view'],
  product: [
    'product.view',
    'product.create',
    'product.update',
    'product.delete',
    'product.viewCost', // field-level: cost price, margin, profit
    'product.import',
    'product.export',
  ],
  catalog: ['category.manage', 'brand.manage', 'supplier.manage', 'media.manage'],
  inventory: [
    'inventory.view',
    'inventory.adjust',
    'inventory.transfer',
    'inventory.receive',
    'purchase.view',
    'purchase.manage',
  ],
  branch: ['branch.view', 'branch.manage'],
  order: ['order.view', 'order.update', 'order.cancel', 'order.refund', 'order.export'],
  pos: [
    'pos.sell',
    'pos.discount',
    'pos.priceOverride',
    'pos.void',
    'shift.open',
    'shift.close',
    'shift.view',
    'shift.cashMovement',
    'return.create',
    'return.approve',
  ],
  customer: [
    'customer.view',
    'customer.manage',
    'customer.export',
    'loyalty.view',
    'loyalty.adjust',
  ],
  marketing: ['campaign.view', 'campaign.manage', 'campaign.send', 'tracking.manage'],
  content: ['page.view', 'page.manage', 'page.publish', 'menu.manage', 'seo.manage'],
  report: ['report.view', 'report.export'],
  settings: [
    'settings.view',
    'settings.general',
    'settings.payments',
    'settings.checkout',
    'settings.notifications',
    'settings.printing',
    'settings.languages',
    'settings.security',
  ],
  staff: ['staff.view', 'staff.manage', 'role.manage', 'audit.view'],
};

/** Frozen map: group → permission keys (for the role editor UI). */
export const PERMISSION_GROUPS = Object.freeze(
  Object.fromEntries(Object.entries(GROUPS).map(([g, keys]) => [g, Object.freeze([...keys])])),
);

/** Every permission key. */
export const ALL_PERMISSIONS = Object.freeze(Object.values(GROUPS).flat());

const KNOWN = new Set(ALL_PERMISSIONS);

/**
 * Constant-style access, e.g. `PERMISSIONS.PRODUCT_VIEW_COST === 'product.viewCost'`.
 * Prefer these over string literals so typos fail loudly.
 */
export const PERMISSIONS = Object.freeze(
  Object.fromEntries(
    ALL_PERMISSIONS.map((key) => [
      key
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace('.', '_')
        .toUpperCase(),
      key,
    ]),
  ),
);

/** @param {unknown} key */
export const isPermission = (key) => typeof key === 'string' && KNOWN.has(key);

/**
 * Checks a granted list. Pure — used by API middleware and the admin `can()` helper.
 * Super-admin bypass is NOT handled here (it is explicit and audited in the RBAC module).
 * @param {readonly string[] | Set<string>} granted
 * @param {string} key
 */
export function hasPermission(granted, key) {
  if (!isPermission(key)) return false;
  return granted instanceof Set
    ? granted.has(key)
    : Array.isArray(granted) && granted.includes(key);
}
