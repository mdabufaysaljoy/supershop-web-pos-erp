/**
 * Domain event names (CLAUDE.md §2.2). Services emit these after commit; subscribers in other
 * modules react. One place for names = no typos and a visible map of who can react to what.
 * Adding an event = add it here. Payloads are documented next to the emitter.
 */
export const EVENTS = Object.freeze({
  // auth (payload always includes { principalType: 'staff' | 'customer', principalId? })
  AUTH_LOGIN_SUCCEEDED: 'auth.loginSucceeded',
  AUTH_LOGIN_FAILED: 'auth.loginFailed',
  AUTH_ACCOUNT_LOCKED: 'auth.accountLocked',
  AUTH_LOGGED_OUT: 'auth.loggedOut',
  AUTH_SESSIONS_REVOKED: 'auth.sessionsRevoked',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refreshReuseDetected',
  AUTH_PASSWORD_CHANGED: 'auth.passwordChanged',
  /** Payload carries the raw one-time `token`: subscribers may only put it in the email link. */
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.passwordResetRequested',
  /** Payload carries the raw one-time `token`: subscribers may only put it in the email link. */
  AUTH_EMAIL_VERIFICATION_REQUESTED: 'auth.emailVerificationRequested',
  AUTH_EMAIL_VERIFIED: 'auth.emailVerified',
  AUTH_2FA_ENABLED: 'auth.twoFactorEnabled',
  AUTH_2FA_DISABLED: 'auth.twoFactorDisabled',

  // users
  STAFF_CREATED: 'staff.created',
  STAFF_UPDATED: 'staff.updated',
  STAFF_DISABLED: 'staff.disabled',
  STAFF_DELETED: 'staff.deleted',
  CUSTOMER_REGISTERED: 'customer.registered',
  /** The customer changed their own profile or address book (P3.5). */
  CUSTOMER_UPDATED: 'customer.updated',
  /** A customer signed in through an identity provider (Google, P3.5). */
  CUSTOMER_OAUTH_LINKED: 'customer.oauthLinked',

  // access control (audited by the audit-log module, P0.6)
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  /** A super-admin performed a mutating request via the permission bypass. */
  ACCESS_SUPER_ADMIN_USED: 'access.superAdminUsed',

  // settings / content
  /** Payload: { changes: [{ key, before, after }] (secrets masked), actorId } */
  SETTINGS_UPDATED: 'settings.updated',
  PAGE_CREATED: 'page.created',
  PAGE_UPDATED: 'page.updated',
  PAGE_PUBLISHED: 'page.published',
  PAGE_DELETED: 'page.deleted',
  MENU_UPDATED: 'menu.updated',
  PRINTER_PROFILE_UPDATED: 'printerProfile.updated',
  RECEIPT_TEMPLATE_UPDATED: 'receiptTemplate.updated',
  LABEL_TEMPLATE_UPDATED: 'labelTemplate.updated',
  SITE_LAYOUT_UPDATED: 'siteLayout.updated',
  TRANSLATION_REQUESTED: 'translation.requested',
  TRANSLATION_COMPLETED: 'translation.completed',
  TRANSLATION_FAILED: 'translation.failed',
  TRANSLATION_BUDGET_EXCEEDED: 'translation.budgetExceeded',
  TRANSLATION_RETRANSLATE_REQUESTED: 'translation.retranslateRequested',
  GLOSSARY_UPDATED: 'glossary.updated',
  UI_STRING_OVERRIDE_SET: 'uiString.overrideSet',
  UI_STRING_OVERRIDE_REMOVED: 'uiString.overrideRemoved',

  // branches
  /** Payload: { branchId, actorId, after } */
  BRANCH_CREATED: 'branch.created',
  /** Payload: { branchId, actorId, before, after } */
  BRANCH_UPDATED: 'branch.updated',
  BRANCH_DELETED: 'branch.deleted',

  // catalog
  /** Payload: { categoryId, actorId, after } */
  CATEGORY_CREATED: 'category.created',
  /** Payload: { categoryId, actorId, before, after } */
  CATEGORY_UPDATED: 'category.updated',
  /** Payload: { categoryId, actorId, before: { parentId, position }, after: { parentId, position } } */
  CATEGORY_MOVED: 'category.moved',
  /** Payload: { categoryId, actorId } (soft delete) */
  CATEGORY_DELETED: 'category.deleted',
  /** Payload: { brandId, actorId, after: { name, slug, isActive, protectName, … } } */
  BRAND_CREATED: 'brand.created',
  /** Payload: { brandId, actorId, before, after } */
  BRAND_UPDATED: 'brand.updated',
  BRAND_DELETED: 'brand.deleted',
  /** Payload: { supplierId, actorId, after } (no contact details) */
  SUPPLIER_CREATED: 'supplier.created',
  SUPPLIER_UPDATED: 'supplier.updated',
  SUPPLIER_DELETED: 'supplier.deleted',
  /** Payload: { fieldId, entity, key, actorId, before?, after? } */
  CUSTOM_FIELD_CREATED: 'customField.created',
  CUSTOM_FIELD_UPDATED: 'customField.updated',
  CUSTOM_FIELD_DELETED: 'customField.deleted',
  /** Payload: { mediaId, actorId, after } */
  MEDIA_UPLOADED: 'media.uploaded',
  /** Payload: { mediaId, actorId, before, after } */
  MEDIA_UPDATED: 'media.updated',
  /** Payload: { mediaId, actorId } (soft delete) */
  MEDIA_DELETED: 'media.deleted',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_PRICE_CHANGED: 'product.priceChanged',
  /** Variant unit cost changed by a goods receipt. Payload: { productId, variantId, before, after, source, actorId } */
  PRODUCT_COST_CHANGED: 'product.costChanged',
  /** Payload: { jobId, actorId, status, dryRun, counts, errorCount } */
  PRODUCT_IMPORT_FINISHED: 'product.importFinished',
  /** Payload: { jobId, actorId, status, counts } */
  PRODUCT_EXPORT_FINISHED: 'product.exportFinished',

  // inventory
  /** Payload: { operationId, docNo, type, branchId, toBranchId, reason, refType, refId, actorId,
   *  lines: [{ variantId, productId, branchId, delta, balanceAfter }] } — after commit. */
  STOCK_MOVED: 'stock.moved',
  /** Level fell to/below its threshold. Payload: { variantId, productId, branchId, onHand, threshold } */
  STOCK_LOW: 'stock.low',
  /** Level fell to zero or below. Same payload as STOCK_LOW. */
  STOCK_OUT: 'stock.out',
  /** Payload: { variantId, branchId, before, after, actorId } */
  STOCK_THRESHOLD_CHANGED: 'stock.thresholdChanged',

  // purchasing — payload: { purchaseOrderId, poNo, actorId, ... }
  PURCHASE_ORDER_CREATED: 'purchaseOrder.created',
  PURCHASE_ORDER_UPDATED: 'purchaseOrder.updated',
  PURCHASE_ORDER_ORDERED: 'purchaseOrder.ordered',
  /** + { operationId, docNo, status, lines: [{ variantId, qty }] } */
  PURCHASE_ORDER_RECEIVED: 'purchaseOrder.received',
  PURCHASE_ORDER_CLOSED: 'purchaseOrder.closed',
  PURCHASE_ORDER_CANCELLED: 'purchaseOrder.cancelled',

  // cart / checkout / orders
  /** Payload: { cartId, customerId, action: add|set|remove|clear|merge, variantId?, qty?, previousQty? } */
  CART_UPDATED: 'cart.updated',
  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  ORDER_COD_CONFIRMED: 'order.codConfirmed',
  ORDER_STATUS_CHANGED: 'order.statusChanged',
  /** A staff note was added to an order (P4.4). */
  ORDER_NOTE_ADDED: 'order.noteAdded',
  ORDER_SHIPPED: 'order.shipped',
  /** A parcel left the branch (carrier + tracking number recorded) — P4.3. */
  SHIPMENT_CREATED: 'shipment.created',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_REFUNDED: 'order.refunded',

  /** A transactional message actually went out (P4.5). */
  NOTIFICATION_SENT: 'notification.sent',

  // payments
  /** A payment page was created and the customer sent to it (P4.1). */
  PAYMENT_STARTED: 'payment.started',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  /** The shop changed what it accepts (P4.2) — audited like any settings change. */
  PAYMENT_METHOD_CREATED: 'paymentMethod.created',
  PAYMENT_METHOD_UPDATED: 'paymentMethod.updated',
  PAYMENT_METHOD_DELETED: 'paymentMethod.deleted',

  // POS / shifts / returns
  POS_SALE_COMPLETED: 'pos.saleCompleted',
  SHIFT_OPENED: 'shift.opened',
  SHIFT_CASH_MOVED: 'shift.cashMoved',
  SHIFT_CLOSED: 'shift.closed',
  RETURN_COMPLETED: 'return.completed',
  EXCHANGE_COMPLETED: 'exchange.completed',

  // loyalty / campaigns
  LOYALTY_EARNED: 'loyalty.earned',
  LOYALTY_REDEEMED: 'loyalty.redeemed',
  LOYALTY_REVERSED: 'loyalty.reversed',
  LOYALTY_ADJUSTED: 'loyalty.adjusted',
  LOYALTY_EXPIRED: 'loyalty.expired',
  LOYALTY_CARD_ISSUED: 'loyalty.cardIssued',
  CAMPAIGN_CREATED: 'campaign.created',
  CAMPAIGN_SCHEDULED: 'campaign.scheduled',
  CAMPAIGN_SENT: 'campaign.sent',
  CAMPAIGN_CANCELLED: 'campaign.cancelled',
  CAMPAIGN_OPT_IN: 'campaign.optIn',
  CAMPAIGN_OPT_OUT: 'campaign.optOut',

  // universal export (P8.4)
  /** Payload: { jobId, actorId, resource, format, status, counts } */
  EXPORT_FINISHED: 'export.finished',

  // tracking & consent (P9.1)
  TRACKING_INTEGRATION_UPDATED: 'tracking.integrationUpdated',
  TRACKING_CONSENT_UPDATED: 'tracking.consentUpdated',
});

const KNOWN = new Set(Object.values(EVENTS));

/** @param {unknown} name */
export const isEventName = (name) => typeof name === 'string' && KNOWN.has(name);
