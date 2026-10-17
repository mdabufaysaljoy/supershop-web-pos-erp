import { EVENTS } from '@supershop/shared';

/**
 * Event → audit entry mapping. Explicit per event (allow-list): fields are picked, never copied
 * wholesale, so one-time tokens and other secrets in event payloads can't leak into the trail.
 * Return shape: { actorType, actorId, entityType, entityId, before?, after?, data? }.
 */
const principal = (p) => ({
  actorType: p.principalType,
  actorId: p.principalId ?? null,
  entityType: p.principalType,
  entityId: p.principalId ?? null,
});
const staffActor = (p) =>
  p.actorId ? { actorType: 'staff', actorId: p.actorId } : { actorType: 'system', actorId: null };

/** @type {Record<string, (payload: any) => object>} */
export const AUDIT_MAPPINGS = {
  // auth (actor = the principal themselves; failed logins may be anonymous)
  [EVENTS.AUTH_LOGIN_SUCCEEDED]: (p) => ({ ...principal(p), data: { ip: p.ip } }),
  [EVENTS.AUTH_LOGIN_FAILED]: (p) => ({
    ...principal(p),
    actorType: p.principalId ? p.principalType : 'anonymous',
    data: { reason: p.reason, ip: p.ip, principalType: p.principalType },
  }),
  [EVENTS.AUTH_ACCOUNT_LOCKED]: (p) => ({ ...principal(p), data: { lockedUntil: p.lockedUntil } }),
  [EVENTS.AUTH_LOGGED_OUT]: (p) => principal(p),
  [EVENTS.AUTH_SESSIONS_REVOKED]: (p) => ({
    ...principal(p),
    data: { reason: p.reason, count: p.count },
  }),
  [EVENTS.AUTH_REFRESH_REUSE_DETECTED]: (p) => ({
    ...principal(p),
    data: { sessionId: p.sessionId, ip: p.ip },
  }),
  [EVENTS.AUTH_PASSWORD_CHANGED]: (p) => ({ ...principal(p), data: { via: p.via ?? 'change' } }),
  // token deliberately NOT recorded
  [EVENTS.AUTH_PASSWORD_RESET_REQUESTED]: (p) => ({
    ...principal(p),
    data: { expiresAt: p.expiresAt },
  }),
  [EVENTS.AUTH_EMAIL_VERIFIED]: (p) => principal(p),
  [EVENTS.CUSTOMER_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'customer',
    entityId: p.customerId,
    before: p.before,
    after: p.after,
  }),

  // staff & roles
  [EVENTS.STAFF_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'staff',
    entityId: p.staffId,
    after: p.after,
  }),
  [EVENTS.STAFF_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'staff',
    entityId: p.staffId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.STAFF_DISABLED]: (p) => ({ ...staffActor(p), entityType: 'staff', entityId: p.staffId }),
  [EVENTS.STAFF_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'staff',
    entityId: p.staffId,
    before: p.before,
  }),
  [EVENTS.ROLE_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'role',
    entityId: p.roleId,
    after: p.after,
  }),
  [EVENTS.ROLE_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'role',
    entityId: p.roleId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.ROLE_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'role',
    entityId: p.roleId,
    before: p.before,
  }),
  [EVENTS.ACCESS_SUPER_ADMIN_USED]: (p) => ({
    actorType: 'staff',
    actorId: p.staffId,
    entityType: 'request',
    data: { method: p.method, path: p.path, permissions: p.permissions },
  }),

  // media library
  [EVENTS.MEDIA_UPLOADED]: (p) => ({
    ...staffActor(p),
    entityType: 'media',
    entityId: p.mediaId,
    after: p.after,
  }),
  [EVENTS.MEDIA_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'media',
    entityId: p.mediaId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.MEDIA_DELETED]: (p) => ({ ...staffActor(p), entityType: 'media', entityId: p.mediaId }),

  // categories
  [EVENTS.CATEGORY_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
    after: p.after,
  }),
  [EVENTS.CATEGORY_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.CATEGORY_MOVED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.CATEGORY_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
  }),

  [EVENTS.PRODUCT_COST_CHANGED]: (p) => ({
    ...staffActor(p),
    entityType: 'variant',
    entityId: p.variantId,
    before: { cost: p.before },
    after: { cost: p.after },
    data: { productId: p.productId, source: p.source },
  }),

  // purchasing
  ...Object.fromEntries(
    [
      EVENTS.PURCHASE_ORDER_CREATED,
      EVENTS.PURCHASE_ORDER_UPDATED,
      EVENTS.PURCHASE_ORDER_ORDERED,
      EVENTS.PURCHASE_ORDER_RECEIVED,
      EVENTS.PURCHASE_ORDER_CLOSED,
      EVENTS.PURCHASE_ORDER_CANCELLED,
    ].map((name) => [
      name,
      (p) => ({
        ...staffActor(p),
        entityType: 'purchaseOrder',
        entityId: p.purchaseOrderId,
        before: p.before ?? null,
        after: p.after ?? null,
        data: {
          poNo: p.poNo,
          ...(p.status && { status: p.status }),
          ...(p.docNo && { docNo: p.docNo, operationId: p.operationId }),
          ...(p.lines && { lines: p.lines.slice(0, 50) }),
          ...(p.note && { note: p.note }),
        },
      }),
    ]),
  ),

  // inventory — manual operations are audited; sales/returns are recorded by their orders
  [EVENTS.STOCK_MOVED]: (p) =>
    ['adjust', 'transfer', 'receive'].includes(p.type)
      ? {
          ...staffActor(p),
          entityType: 'stockOperation',
          entityId: p.operationId,
          data: {
            docNo: p.docNo,
            type: p.type,
            reason: p.reason,
            branchId: p.branchId,
            toBranchId: p.toBranchId,
            lineCount: p.lines.length,
            lines: p.lines.slice(0, 50).map((l) => ({
              variantId: l.variantId,
              branchId: l.branchId,
              delta: l.delta,
              balanceAfter: l.balanceAfter,
            })),
          },
        }
      : [],
  [EVENTS.STOCK_THRESHOLD_CHANGED]: (p) => ({
    ...staffActor(p),
    entityType: 'stockLevel',
    entityId: p.variantId,
    before: { lowStockThreshold: p.before },
    after: { lowStockThreshold: p.after },
    data: { branchId: p.branchId },
  }),

  // branches
  [EVENTS.BRANCH_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'branch',
    entityId: p.branchId,
    after: p.after,
  }),
  [EVENTS.BRANCH_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'branch',
    entityId: p.branchId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.BRANCH_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'branch',
    entityId: p.branchId,
  }),

  // brands & suppliers
  [EVENTS.BRAND_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'brand',
    entityId: p.brandId,
    after: p.after,
  }),
  [EVENTS.BRAND_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'brand',
    entityId: p.brandId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.BRAND_DELETED]: (p) => ({ ...staffActor(p), entityType: 'brand', entityId: p.brandId }),
  [EVENTS.SUPPLIER_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'supplier',
    entityId: p.supplierId,
    after: p.after,
  }),
  [EVENTS.SUPPLIER_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'supplier',
    entityId: p.supplierId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.SUPPLIER_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'supplier',
    entityId: p.supplierId,
  }),

  // products & custom fields
  [EVENTS.PRODUCT_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'product',
    entityId: p.productId,
    after: p.after,
  }),
  [EVENTS.PRODUCT_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'product',
    entityId: p.productId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.PRODUCT_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'product',
    entityId: p.productId,
  }),
  [EVENTS.PRODUCT_PRICE_CHANGED]: (p) => ({
    ...staffActor(p),
    entityType: 'product',
    entityId: p.productId,
    data: { changes: p.changes },
  }),
  [EVENTS.PRODUCT_IMPORT_FINISHED]: (p) => ({
    ...staffActor(p),
    entityType: 'productImport',
    entityId: p.jobId,
    data: { status: p.status, dryRun: p.dryRun, counts: p.counts, errorCount: p.errorCount },
  }),
  [EVENTS.PRODUCT_EXPORT_FINISHED]: (p) => ({
    ...staffActor(p),
    entityType: 'productExport',
    entityId: p.jobId,
    data: { status: p.status, counts: p.counts },
  }),
  [EVENTS.CUSTOM_FIELD_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'customField',
    entityId: p.fieldId,
    after: { entity: p.entity, key: p.key, ...p.after },
  }),
  [EVENTS.CUSTOM_FIELD_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'customField',
    entityId: p.fieldId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.CUSTOM_FIELD_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'customField',
    entityId: p.fieldId,
    data: { entity: p.entity, key: p.key },
  }),

  // languages / translation
  [EVENTS.GLOSSARY_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'glossaryTerm',
    entityId: p.termId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.UI_STRING_OVERRIDE_SET]: (p) => ({
    ...staffActor(p),
    entityType: 'uiString',
    entityId: `${p.catalog}:${p.lang}:${p.key}`,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.UI_STRING_OVERRIDE_REMOVED]: (p) => ({
    ...staffActor(p),
    entityType: 'uiString',
    entityId: `${p.catalog}:${p.lang}:${p.key}`,
    before: p.before,
  }),
  [EVENTS.TRANSLATION_RETRANSLATE_REQUESTED]: (p) => ({
    ...staffActor(p),
    entityType: 'translation',
    data: { scope: p.scope, scheduled: p.scheduled },
  }),

  // settings: one entry per changed key (expanded in the subscriber); values already masked
  [EVENTS.SETTINGS_UPDATED]: (p) =>
    p.changes.map((c) => ({
      ...staffActor(p),
      entityType: 'setting',
      entityId: c.key,
      before: c.before,
      after: c.after,
    })),

  // printing & templates
  [EVENTS.PRINTER_PROFILE_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'printerProfile',
    entityId: p.profileId,
    data: { action: p.action, name: p.name },
  }),
  [EVENTS.RECEIPT_TEMPLATE_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'receiptTemplate',
    entityId: 'default',
    data: { lang: p.lang, widthMm: p.widthMm },
  }),
  [EVENTS.LABEL_TEMPLATE_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'labelTemplate',
    entityId: 'default',
    data: { widthMm: p.widthMm, heightMm: p.heightMm },
  }),

  // shifts (P6.5)
  [EVENTS.SHIFT_OPENED]: (p) => ({
    ...staffActor(p),
    entityType: 'shift',
    entityId: p.shiftId,
    after: {
      shiftNo: p.shiftNo,
      branchId: p.branchId,
      openingCash: p.openingCash,
    },
  }),
  [EVENTS.SHIFT_CASH_MOVED]: (p) => ({
    ...staffActor(p),
    entityType: 'shift',
    entityId: p.shiftId,
    data: {
      shiftNo: p.shiftNo,
      branchId: p.branchId,
      type: p.type,
      amount: p.amount,
      reason: p.reason,
      expectedCash: p.expectedCash,
    },
  }),
  [EVENTS.SHIFT_CLOSED]: (p) => ({
    ...staffActor(p),
    entityType: 'shift',
    entityId: p.shiftId,
    after: {
      shiftNo: p.shiftNo,
      zReportId: p.zReportId,
      zReportNo: p.zReportNo,
      branchId: p.branchId,
      openingCash: p.openingCash,
      closingCash: p.closingCash,
      expectedCash: p.expectedCash,
      discrepancy: p.discrepancy,
    },
  }),

  // returns & exchanges (P6.6)
  [EVENTS.RETURN_COMPLETED]: (p) => ({
    ...staffActor(p),
    entityType: 'returnExchange',
    entityId: p.returnId,
    after: {
      returnNo: p.returnNo,
      type: p.type,
      orderId: p.orderId,
      orderNo: p.orderNo,
      branchId: p.branchId,
      returnTotal: p.returnTotal,
      refundAmount: p.refundAmount,
      refundMethod: p.refundMethod,
    },
  }),
  [EVENTS.EXCHANGE_COMPLETED]: (p) => ({
    ...staffActor(p),
    entityType: 'returnExchange',
    entityId: p.returnId,
    after: {
      returnNo: p.returnNo,
      type: p.type,
      orderId: p.orderId,
      orderNo: p.orderNo,
      branchId: p.branchId,
      returnTotal: p.returnTotal,
      differenceDue: p.differenceDue,
    },
  }),
  [EVENTS.LOYALTY_EARNED]: (p) => ({
    actorType: 'system',
    actorId: null,
    entityType: 'customer',
    entityId: p.customerId,
    data: {
      orderId: p.orderId,
      orderNo: p.orderNo,
      points: p.points,
      balanceAfter: p.balanceAfter,
      tier: p.tier,
      channel: p.channel,
    },
  }),
  [EVENTS.LOYALTY_REDEEMED]: (p) => ({
    actorType: p.actorId ? 'staff' : 'customer',
    actorId: p.actorId ?? p.customerId,
    entityType: 'customer',
    entityId: p.customerId,
    data: {
      orderId: p.orderId,
      orderNo: p.orderNo,
      points: p.points,
      discountHalalas: p.discountHalalas,
      balanceAfter: p.balanceAfter,
    },
  }),
  [EVENTS.LOYALTY_REVERSED]: (p) => ({
    ...staffActor(p),
    entityType: 'returnExchange',
    entityId: p.returnId,
    data: {
      returnNo: p.returnNo,
      orderId: p.orderId,
      orderNo: p.orderNo,
      customerId: p.customerId,
      amount: p.amount,
      pointsReversed: p.pointsReversed,
      balanceAfter: p.balanceAfter,
    },
  }),
  [EVENTS.LOYALTY_ADJUSTED]: (p) => ({
    ...staffActor(p),
    entityType: 'customer',
    entityId: p.customerId,
    data: {
      delta: p.delta,
      balanceAfter: p.balanceAfter,
      reason: p.reason,
    },
  }),
  [EVENTS.LOYALTY_EXPIRED]: (p) => ({
    actorType: 'system',
    actorId: null,
    entityType: 'customer',
    entityId: p.customerId,
    data: {
      points: p.points,
      balanceAfter: p.balanceAfter,
    },
  }),
  [EVENTS.CAMPAIGN_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'campaign',
    entityId: p.campaignId,
    data: { channel: p.channel, segment: p.segment },
  }),
  [EVENTS.CAMPAIGN_SCHEDULED]: (p) => ({
    ...staffActor(p),
    entityType: 'campaign',
    entityId: p.campaignId,
    data: { channel: p.channel, scheduledAt: p.scheduledAt },
  }),
  [EVENTS.CAMPAIGN_CANCELLED]: (p) => ({
    ...staffActor(p),
    entityType: 'campaign',
    entityId: p.campaignId,
    data: { channel: p.channel },
  }),
  [EVENTS.CAMPAIGN_SENT]: (p) => ({
    actorType: 'system',
    actorId: null,
    entityType: 'campaign',
    entityId: p.campaignId,
    data: { channel: p.channel, stats: p.stats },
  }),
  [EVENTS.CAMPAIGN_OPT_OUT]: (p) => ({
    actorType: 'customer',
    actorId: p.customerId ?? null,
    entityType: 'customer',
    entityId: p.customerId ?? null,
    data: { channel: p.channel },
  }),
};

/** Last line of defense: strip secret-looking fields anywhere in before/after/data. */
const SECRET_KEY_RE =
  /^(password|passwordHash|token|refreshToken|accessToken|secret|apiKey|encryptedValue)$/i;
export function scrubSecrets(value, depth = 0) {
  if (depth > 10 || value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SECRET_KEY_RE.test(k) ? '[REDACTED]' : scrubSecrets(v, depth + 1),
    ]),
  );
}
