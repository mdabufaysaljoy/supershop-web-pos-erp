import { ERROR_CODES } from '../errorCodes.js';
import { createFormatters } from '../format.js';
import { PAPER, previewLines } from '../printing/escpos.js';
import { renderTemplate } from '../printing/template.js';
import { tenderSummary } from './sale.js';

/**
 * Returns & exchanges (P6.6).
 *
 * Pure money & quantity rules shared by the API and the admin UI:
 *  - Every returned line is priced from the original order's snapshot (never the live catalog),
 *    pro-rated by quantity so partial returns across multiple visits add up to 100% of the line
 *    without a single halala of rounding drift.
 *  - Each returned line carries a disposition: `restock` (goes back on the shelf via a `return`
 *    stock operation) or `damaged` (recorded as returned and immediately written off via an
 *    `adjust` `damaged` ledger operation so sellable on-hand is untouched while the audit trail is
 *    complete).
 *  - Exchanges enforce `newTotal >= returnCredit.total` (`EXCHANGE_VALUE_TOO_LOW` otherwise); the
 *    customer pays `differenceDue = newTotal - returnCredit.total`.
 */
export const RETURN_EXCHANGE = Object.freeze({
  TYPES: Object.freeze(['return', 'exchange']),
  DISPOSITIONS: Object.freeze(['restock', 'damaged']),
  REFUND_METHODS: Object.freeze(['cash', 'card', 'original', 'store_credit']),
  RETURN_PREFIX: 'RET-',
  EXCHANGE_PREFIX: 'EXC-',
  MAX_LINES: 100,
  REASON_MAX: 240,
});

/** Half-away-from-zero integer division for pro-rata halala amounts. */
const proRata = (amount, qty, totalQty) => {
  if (!amount || qty <= 0 || totalQty <= 0) return 0;
  const n = BigInt(amount) * BigInt(qty);
  const d = BigInt(totalQty);
  return Number((n * 2n + d) / (d * 2n));
};

/**
 * Prices returned items against the original order's snapshotted lines and any prior returns.
 *
 * @param {Array<object>} orderItems - `order.items` from the original order
 * @param {Array<{ variantId: string, qty: number, disposition?: 'restock'|'damaged', reason?: string }>} returnLines
 * @param {Map<string, { qty: number, lineTotal: number, net: number, vat: number, discountTotal: number }> | Record<string, object>} [priorByVariant]
 */
export function priceReturnedLines(orderItems = [], returnLines = [], priorByVariant = new Map()) {
  const byVariant = new Map(orderItems.map((item) => [String(item.variantId), item]));
  const getPrior = (variantId) => {
    const key = String(variantId);
    const entry =
      priorByVariant instanceof Map ? priorByVariant.get(key) : (priorByVariant?.[key] ?? null);
    return {
      qty: entry?.qty ?? 0,
      lineTotal: entry?.lineTotal ?? 0,
      net: entry?.net ?? 0,
      vat: entry?.vat ?? 0,
      discountTotal: entry?.discountTotal ?? 0,
    };
  };

  const issues = [];
  const lines = [];
  const requestedByVariant = new Map();

  for (const [index, req] of returnLines.entries()) {
    const vid = String(req.variantId);
    const orderItem = byVariant.get(vid);
    if (!orderItem) {
      issues.push({
        path: `returnLines.${index}.variantId`,
        code: ERROR_CODES.VALIDATION_ERROR,
        variantId: vid,
      });
      continue;
    }

    const prior = getPrior(vid);
    const alreadyInRequest = requestedByVariant.get(vid) ?? 0;
    const remainingQty = Math.max(0, orderItem.qty - prior.qty - alreadyInRequest);
    if (req.qty > remainingQty) {
      issues.push({
        path: `returnLines.${index}.qty`,
        code: ERROR_CODES.RETURN_QTY_EXCEEDED,
        variantId: vid,
        name: orderItem.name,
        wanted: req.qty,
        available: remainingQty,
      });
      continue;
    }
    requestedByVariant.set(vid, alreadyInRequest + req.qty);

    // If this line completes the return of the entire order line (and isn't split across two
    // dispositions in the same request), award the exact remainder so partial returns always sum
    // to 100% of the original line.
    const isFinalRemainder =
      alreadyInRequest === 0 &&
      returnLines.filter((r) => String(r.variantId) === vid).length === 1 &&
      prior.qty + req.qty === orderItem.qty;

    const grossBeforeDiscount = orderItem.unitPrice * req.qty;
    const lineTotal = isFinalRemainder
      ? Math.max(0, orderItem.lineTotal - prior.lineTotal)
      : proRata(orderItem.lineTotal, req.qty, orderItem.qty);
    const vat = isFinalRemainder
      ? Math.max(0, orderItem.vat - prior.vat)
      : proRata(orderItem.vat, req.qty, orderItem.qty);
    const net = isFinalRemainder
      ? Math.max(0, orderItem.net - prior.net)
      : Math.max(0, lineTotal - vat);
    const discountTotal = isFinalRemainder
      ? Math.max(0, (orderItem.discountTotal ?? 0) - prior.discountTotal)
      : proRata(orderItem.discountTotal ?? 0, req.qty, orderItem.qty);

    lines.push({
      productId: String(orderItem.productId),
      variantId: vid,
      sku: orderItem.sku ?? '',
      name: orderItem.name,
      options: orderItem.options ?? [],
      imageUrl: orderItem.imageUrl ?? orderItem.image ?? null,
      unitPrice: orderItem.unitPrice,
      qty: req.qty,
      disposition: req.disposition ?? 'restock',
      reason: req.reason ?? '',
      taxCategory: orderItem.taxCategory ?? 'standard',
      vatRateBps: orderItem.vatRateBps ?? 0,
      subtotal: grossBeforeDiscount,
      discountTotal,
      lineTotal,
      net,
      vat,
    });
  }

  const totals = lines.reduce(
    (acc, l) => ({
      itemCount: acc.itemCount + l.qty,
      subtotal: acc.subtotal + l.subtotal,
      discountTotal: acc.discountTotal + l.discountTotal,
      net: acc.net + l.net,
      vat: acc.vat + l.vat,
      total: acc.total + l.lineTotal,
    }),
    { itemCount: 0, subtotal: 0, discountTotal: 0, net: 0, vat: 0, total: 0 },
  );

  const fullyReturned =
    issues.length === 0 &&
    orderItems.length > 0 &&
    orderItems.every((item) => {
      const vid = String(item.variantId);
      const prior = getPrior(vid);
      const added = requestedByVariant.get(vid) ?? 0;
      return prior.qty + added >= item.qty;
    });

  return { issues, lines, totals, fullyReturned };
}

/**
 * Exchange rule (P6.6): replacement items must be worth at least the returned credit
 * (`exchangeTotal >= returnCredit.total`). The customer pays any positive difference.
 */
export function priceExchangeSettlement({ returnCredit, exchangePriced, payments = [] }) {
  const creditTotal = returnCredit?.total ?? 0;
  const exchangeTotal = exchangePriced?.totals?.total ?? 0;
  if (exchangeTotal < creditTotal) {
    return {
      valid: false,
      code: ERROR_CODES.EXCHANGE_VALUE_TOO_LOW,
      creditTotal,
      exchangeTotal,
      differenceDue: 0,
      shortfall: creditTotal - exchangeTotal,
      tender: tenderSummary(0, payments),
    };
  }
  const differenceDue = exchangeTotal - creditTotal;
  return {
    valid: true,
    code: null,
    creditTotal,
    exchangeTotal,
    differenceDue,
    shortfall: 0,
    tender: tenderSummary(differenceDue, payments),
  };
}

/** Formats a ReturnExchange record into values for `renderTemplate`. */
export function returnReceiptData(
  record,
  {
    shop = {},
    branch = null,
    cashier = null,
    currency = 'SAR',
    lang = 'en',
    timeZone = 'Asia/Riyadh',
  } = {},
) {
  const fmt = createFormatters({ lang, currency, timeZone });
  const money = (v) => fmt.money(v ?? 0).replace(/\u00a0/g, ' ');
  const isExchange = record.type === 'exchange';
  const returnItems = (record.returnLines ?? []).map((l) => ({
    name: `RET ${l.qty}x ${l.name} (${l.disposition === 'damaged' ? 'Damaged' : 'Restock'})`,
    lineTotal: `-${money(l.lineTotal)}`,
  }));
  const exchangeItems = (record.exchangeLines ?? []).map((l) => ({
    name: `NEW ${l.qty}x ${l.name}`,
    lineTotal: money(l.lineTotal),
  }));

  return {
    shop: {
      name: shop.name ?? '',
      address: shop.address ?? '',
      phone: shop.phone ?? '',
      vatNumber: shop.vatNumber ?? '',
    },
    doc: {
      title: isExchange ? 'EXCHANGE RECEIPT' : 'RETURN / CREDIT NOTE',
      returnNo: record.returnNo ?? '',
      orderNo: record.orderNo ?? '',
      date: record.createdAt
        ? fmt.dateTime(record.createdAt, { dateStyle: 'short', timeStyle: 'short' })
        : '',
      branch: branch ?? '',
      cashier: cashier ?? '',
      returnCredit: money(record.returnTotals?.total ?? 0),
      returnVat: money(record.returnTotals?.vat ?? 0),
      exchangeTotal: isExchange ? money(record.exchangeTotals?.total ?? 0) : '',
      differenceDue: isExchange ? money(record.differenceDue ?? 0) : '',
      refundAmount: !isExchange ? money(record.refundAmount ?? 0) : '',
      refundMethod: !isExchange ? String(record.refundMethod ?? '').toUpperCase() : '',
      change: (record.changeGiven ?? 0) > 0 ? money(record.changeGiven) : '',
      zatcaQr: record.zatcaQr ?? '',
    },
    items: [...returnItems, ...exchangeItems],
    payments: (record.payments ?? []).map((p) => ({
      label: p.label ?? p.method,
      amount: money(p.amount),
    })),
    raw: {
      shopAddress: shop.address ? 1 : 0,
      vatNumber: shop.vatNumber ? 1 : 0,
      branch: branch ? 1 : 0,
      cashier: cashier ? 1 : 0,
      isExchange: isExchange ? 1 : 0,
      isReturn: !isExchange ? 1 : 0,
      hasPayments: (record.payments?.length ?? 0) > 0 ? 1 : 0,
      hasChange: (record.changeGiven ?? 0) > 0 ? 1 : 0,
      hasQr: record.zatcaQr ? 1 : 0,
    },
  };
}

export function buildReturnReceiptTemplate({ cut = true, openDrawer = false } = {}) {
  return [
    { type: 'text', value: '{{shop.name}}', align: 'center', bold: true, size: 'double' },
    { type: 'text', value: '{{shop.address}}', align: 'center', showIf: 'raw.shopAddress' },
    { type: 'text', value: 'VAT: {{shop.vatNumber}}', align: 'center', showIf: 'raw.vatNumber' },
    { type: 'rule' },
    { type: 'text', value: '{{doc.title}}', align: 'center', bold: true },
    { type: 'row', left: 'Document', right: '{{doc.returnNo}}', bold: true },
    { type: 'row', left: 'Orig. Order', right: '{{doc.orderNo}}' },
    { type: 'row', left: 'Date', right: '{{doc.date}}' },
    { type: 'row', left: 'Branch', right: '{{doc.branch}}', showIf: 'raw.branch' },
    { type: 'row', left: 'Staff', right: '{{doc.cashier}}', showIf: 'raw.cashier' },
    { type: 'rule' },
    {
      type: 'items',
      line: { type: 'row', left: '{{name}}', right: '{{lineTotal}}' },
    },
    { type: 'rule' },
    { type: 'row', left: 'Return credit', right: '{{doc.returnCredit}}', bold: true },
    { type: 'row', left: 'VAT reversed', right: '{{doc.returnVat}}' },
    {
      type: 'row',
      left: 'New items total',
      right: '{{doc.exchangeTotal}}',
      showIf: 'raw.isExchange',
    },
    {
      type: 'row',
      left: 'Difference due',
      right: '{{doc.differenceDue}}',
      bold: true,
      showIf: 'raw.isExchange',
    },
    {
      type: 'row',
      left: 'Refunded',
      right: '{{doc.refundAmount}}',
      bold: true,
      showIf: 'raw.isReturn',
    },
    {
      type: 'row',
      left: 'Refund method',
      right: '{{doc.refundMethod}}',
      showIf: 'raw.isReturn',
    },
    {
      type: 'payments',
      line: { type: 'row', left: '{{label}}', right: '{{amount}}' },
      showIf: 'raw.hasPayments',
    },
    { type: 'row', left: 'Change', right: '{{doc.change}}', showIf: 'raw.hasChange' },
    { type: 'rule', showIf: 'raw.hasQr' },
    { type: 'qr', value: '{{doc.zatcaQr}}', size: 6, showIf: 'raw.hasQr' },
    { type: 'feed', lines: 3 },
    ...(openDrawer ? [{ type: 'drawer' }] : []),
    ...(cut ? [{ type: 'cut' }] : []),
  ];
}

export function renderReturnReceipt(
  record,
  { widthMm = PAPER.DEFAULT_WIDTH, cut = true, openDrawer = false, ...ctx } = {},
) {
  const data = returnReceiptData(record, ctx);
  const template = buildReturnReceiptTemplate({ cut, openDrawer });
  const bytes = renderTemplate(template, data, { widthMm });
  return {
    data,
    bytes,
    lines: previewLines(bytes),
  };
}
