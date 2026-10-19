import {
  ERROR_CODES,
  EVENTS,
  PAYMENT_METHOD,
  PERMISSIONS as P,
  priceExchangeSettlement,
  priceReturnedLines,
  priceSale,
  renderReturnReceipt,
  RETURN_EXCHANGE,
  SOURCE_LANGUAGE,
  vatRateFor,
  zatcaQr,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import mongoose from 'mongoose';
import { formatSequence, nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import { getBranchSummaries } from '../branches/index.js';
import { applyStockOperation, getOnHand, publishStockResult } from '../inventory/index.js';
import { applyOrderReturnOutcome, findOrderForReturn } from '../orders/index.js';
import { availableMethods, resolveForCheckout } from '../paymentMethods/index.js';
import { buildReturnReceiptJob } from '../printing/index.js';
import { getCartVariants } from '../products/index.js';
import { getSetting } from '../settings/index.js';
import { getStaffNames } from '../staff/index.js';
import * as repo from './return.repo.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));

const RETURNABLE_STATUSES = new Set([
  'paid',
  'delivered',
  'completed',
  'partially_returned',
  'exchanged',
]);

let providers = {
  findOpenShift: async () => null,
};

export function setReturnProviders(next = {}) {
  providers = { ...providers, ...next };
}

export const countReturnsInBranch = (branchId) => repo.countByBranch(oid(branchId));

const refuse = (code, message, details) => new AppError(code, message, { status: 409, details });

/** Builds a Map<variantId, { qty, lineTotal, net, vat, discountTotal }> from prior return records. */
function buildPriorReturnedMap(priorRecords = []) {
  const map = new Map();
  for (const rec of priorRecords) {
    for (const line of rec.returnLines ?? []) {
      const vid = str(line.variantId);
      const prev = map.get(vid) ?? {
        qty: 0,
        lineTotal: 0,
        net: 0,
        vat: 0,
        discountTotal: 0,
      };
      map.set(vid, {
        qty: prev.qty + (line.qty ?? 0),
        lineTotal: prev.lineTotal + (line.lineTotal ?? 0),
        net: prev.net + (line.net ?? 0),
        vat: prev.vat + (line.vat ?? 0),
        discountTotal: prev.discountTotal + (line.discountTotal ?? 0),
      });
    }
  }
  return map;
}

/** Aggregate quantities per variantId for stock operations (which require unique variantIds). */
function aggregateVariantLines(lines) {
  const byVariant = new Map();
  for (const line of lines) {
    const vid = str(line.variantId);
    byVariant.set(vid, (byVariant.get(vid) ?? 0) + line.qty);
  }
  return [...byVariant.entries()].map(([variantId, qty]) => ({ variantId, qty }));
}

async function priceExchangeItems(actor, items = [], orderDiscount = null, lang = SOURCE_LANGUAGE) {
  if (!items.length) return { items: [], totals: null };
  if (items.some((i) => i.unitPrice !== undefined) && !actor.can(P.POS_PRICE_OVERRIDE))
    throw new ForbiddenError('Changing a price needs permission');
  if ((items.some((i) => i.discount) || orderDiscount) && !actor.can(P.POS_DISCOUNT))
    throw new ForbiddenError('Giving a discount needs permission');

  const variants = await getCartVariants(
    items.map((i) => i.variantId),
    lang,
  );
  const details = [];
  const rawLines = items.map((item, i) => {
    const v = variants.get(String(item.variantId));
    if (!v || !v.sellable) {
      details.push({ path: `exchangeItems.${i}.variantId`, message: V.ID_INVALID });
    }
    return {
      ...v,
      qty: item.qty,
      unitPrice: item.unitPrice ?? v?.price ?? 0,
      discount: item.discount ?? null,
    };
  });
  if (details.length) throw new ValidationError(details, 'Invalid exchange items');

  const tax = {
    vatRateBps: getSetting('tax.vatRateBps'),
    pricesIncludeVat: getSetting('tax.pricesIncludeVat'),
  };
  const priced = priceSale(
    rawLines.map((l) => ({
      unitPrice: l.unitPrice,
      qty: l.qty,
      taxCategory: l.taxCategory,
      discount: l.discount,
    })),
    { orderDiscount, tax },
  );

  const exchangeLines = rawLines.map((l, i) => ({
    productId: oid(l.productId),
    variantId: oid(l.variantId),
    sku: l.sku ?? '',
    name: l.name,
    options: l.options ?? [],
    imageUrl: l.image?.thumbUrl ?? l.image?.url ?? null,
    unitPrice: l.unitPrice,
    qty: l.qty,
    taxCategory: l.taxCategory ?? 'standard',
    vatRateBps: vatRateFor(l.taxCategory ?? 'standard', { standardRateBps: tax.vatRateBps }),
    discount: l.discount,
    discountTotal: priced.lines[i].discountTotal,
    lineTotal: priced.lines[i].lineTotal,
    net: priced.lines[i].net,
    vat: priced.lines[i].vat,
  }));

  return {
    items: exchangeLines,
    totals: {
      itemCount: priced.totals.itemCount,
      subtotal: priced.totals.subtotal,
      discountTotal: priced.totals.discountTotal,
      net: priced.totals.net,
      vat: priced.totals.vat,
      total: priced.totals.total,
    },
  };
}

async function assertExchangeStock(branchId, items) {
  if (!items.length || getSetting('pos.allowOversell')) return;
  const onHand = await getOnHand(
    branchId,
    items.map((i) => str(i.variantId)),
  );
  const wanted = new Map();
  for (const item of items) {
    const vid = str(item.variantId);
    wanted.set(vid, (wanted.get(vid) ?? 0) + item.qty);
  }
  const short = [...wanted.entries()].filter(([id, qty]) => (onHand.get(id) ?? 0) < qty);
  if (short.length) {
    throw refuse(
      ERROR_CODES.INSUFFICIENT_STOCK,
      'Not enough stock for exchange items at this branch',
      short.map(([id, qty]) => ({
        path: `exchangeItems.${id}`,
        message: V.QTY_INSUFFICIENT,
        variantId: id,
        wanted: qty,
        available: onHand.get(id) ?? 0,
      })),
    );
  }
}

async function resolveExchangePayments(tenders = [], total, lang = SOURCE_LANGUAGE) {
  if (total <= 0 || !tenders.length) return [];
  const details = [];
  const payments = [];
  for (const [i, tender] of tenders.entries()) {
    try {
      const { method } = await resolveForCheckout(tender.method, { total, channel: 'pos' });
      payments.push({
        method: method.key,
        methodType: method.type,
        label:
          (method.label?.[lang] ?? method.label?.[SOURCE_LANGUAGE] ?? method.key) || method.key,
        amount: tender.amount,
        reference: tender.reference ?? null,
        at: new Date(),
      });
    } catch {
      details.push({ path: `payments.${i}.method`, message: V.ID_INVALID });
    }
  }
  if (details.length) throw new ValidationError(details, 'Invalid payment method for exchange');
  return payments;
}

function assertOrderReturnable(actor, order, requestedBranchId) {
  if (!order) throw new NotFoundError('Order not found');
  const branchId = requestedBranchId ?? str(order.branchId);
  if (!branchId) {
    throw new ValidationError([{ path: 'branchId', message: V.REQUIRED }], 'Branch is required');
  }
  actor.assertBranch(branchId);
  if (!RETURNABLE_STATUSES.has(order.status)) {
    throw refuse(
      ERROR_CODES.ORDER_NOT_RETURNABLE,
      `Order ${order.orderNo} in status ${order.status} cannot be returned or exchanged`,
    );
  }
  return branchId;
}

function throwIfReturnIssues(issues) {
  if (!issues.length) return;
  const qtyExceeded = issues.find((i) => i.code === ERROR_CODES.RETURN_QTY_EXCEEDED);
  if (qtyExceeded) {
    throw refuse(
      ERROR_CODES.RETURN_QTY_EXCEEDED,
      'Return quantity exceeds remaining returnable quantity on the order',
      issues,
    );
  }
  throw new ValidationError(
    issues.map((i) => ({ path: i.path, message: V.ID_INVALID })),
    'Invalid return lines',
  );
}

/**
 * Look up an order by orderNo or ID along with per-line remaining returnable quantities.
 */
export async function lookupOrderForReturn(actor, { q }, { lang = SOURCE_LANGUAGE } = {}) {
  const order = await findOrderForReturn(q);
  if (!order) throw new NotFoundError('Order not found');
  if (order.branchId) actor.assertBranch(str(order.branchId));

  const priorRecords = await repo.listByOrderId(order._id);
  const priorMap = buildPriorReturnedMap(priorRecords);

  const items = (order.items ?? []).map((item) => {
    const vid = str(item.variantId);
    const prior = priorMap.get(vid);
    const returnedQty = prior?.qty ?? 0;
    const returnableQty = Math.max(0, item.qty - returnedQty);
    return {
      productId: str(item.productId),
      variantId: vid,
      sku: item.sku,
      name: item.name,
      options: item.options ?? [],
      imageUrl: item.imageUrl ?? null,
      unitPrice: item.unitPrice,
      qty: item.qty,
      returnedQty,
      returnableQty,
      discountTotal: item.discountTotal ?? 0,
      lineTotal: item.lineTotal,
      net: item.net,
      vat: item.vat,
    };
  });

  const methods = await availableMethods({ total: order.totals?.total ?? 0, lang, channel: 'pos' });

  return {
    order: {
      id: str(order._id),
      orderNo: order.orderNo,
      channel: order.channel,
      status: order.status,
      branchId: str(order.branchId),
      placedAt: order.placedAt,
      customer: {
        customerId: str(order.customer?.customerId),
        name: order.customer?.name ?? '',
        phone: order.customer?.phone ?? '',
        email: order.customer?.email ?? null,
      },
      totals: order.totals,
      payment: order.payment,
    },
    items,
    returnable: RETURNABLE_STATUSES.has(order.status) && items.some((i) => i.returnableQty > 0),
    priorReturns: await Promise.all(priorRecords.map(toReturnDto)),
    methods,
  };
}

/**
 * Quote a return or exchange before committing it.
 */
export async function quoteReturnExchange(actor, input, { lang = SOURCE_LANGUAGE } = {}) {
  const order = await findOrderForReturn(input.orderId);
  const branchId = assertOrderReturnable(actor, order, input.branchId);
  const priorRecords = await repo.listByOrderId(order._id);
  const priorMap = buildPriorReturnedMap(priorRecords);

  const pricedReturn = priceReturnedLines(order.items, input.returnLines, priorMap);
  throwIfReturnIssues(pricedReturn.issues);

  if (input.type === 'exchange') {
    const exchangePriced = await priceExchangeItems(
      actor,
      input.exchangeItems ?? [],
      input.orderDiscount ?? null,
      lang,
    );
    const settlement = priceExchangeSettlement({
      returnCredit: pricedReturn.totals,
      exchangePriced,
      payments: input.payments ?? [],
    });
    return {
      type: 'exchange',
      branchId,
      returnLines: pricedReturn.lines,
      returnTotals: pricedReturn.totals,
      exchangeLines: exchangePriced.items.map((l) => ({
        ...l,
        productId: str(l.productId),
        variantId: str(l.variantId),
      })),
      exchangeTotals: exchangePriced.totals,
      settlement,
      fullyReturned: pricedReturn.fullyReturned,
    };
  }

  return {
    type: 'return',
    branchId,
    returnLines: pricedReturn.lines,
    returnTotals: pricedReturn.totals,
    refundAmount: pricedReturn.totals.total,
    fullyReturned: pricedReturn.fullyReturned,
  };
}

/**
 * Execute a return or exchange in a single transaction:
 *  - Restocked items -> `return` stock operation (+qty)
 *  - Damaged items -> `return` (+qty) + immediate `adjust` `damaged` (-qty)
 *  - Exchange items -> `sale` stock operation (-qty)
 *  - Original order status -> `partially_returned` | `refunded` | `exchanged`
 *  - Loyalty reversal event emitted when customerId is attached
 */
export async function createReturnExchange(
  actor,
  input,
  { idempotencyKey = null, lang = SOURCE_LANGUAGE } = {},
) {
  const key = idempotencyKey ? `ret:${actor.staffId}:${idempotencyKey}` : null;
  if (key) {
    const existing = await repo.findByIdempotencyKey(key);
    if (existing) return { record: await toReturnDto(existing), replayed: true };
  }

  const order = await findOrderForReturn(input.orderId);
  const branchId = assertOrderReturnable(actor, order, input.branchId);
  const priorRecords = await repo.listByOrderId(order._id);
  const priorMap = buildPriorReturnedMap(priorRecords);

  const initialReturn = priceReturnedLines(order.items, input.returnLines, priorMap);
  throwIfReturnIssues(initialReturn.issues);

  const isExchange = input.type === 'exchange';
  let exchangePriced = { items: [], totals: null };
  let settlement = null;
  let payments = [];

  if (isExchange) {
    exchangePriced = await priceExchangeItems(
      actor,
      input.exchangeItems ?? [],
      input.orderDiscount ?? null,
      lang,
    );
    await assertExchangeStock(branchId, exchangePriced.items);
    settlement = priceExchangeSettlement({
      returnCredit: initialReturn.totals,
      exchangePriced,
      payments: input.payments ?? [],
    });
    if (!settlement.valid) {
      throw refuse(
        ERROR_CODES.EXCHANGE_VALUE_TOO_LOW,
        'Exchange items must be equal to or greater than the returned credit',
        [
          {
            path: 'exchangeItems',
            creditTotal: settlement.creditTotal,
            exchangeTotal: settlement.exchangeTotal,
            shortfall: settlement.shortfall,
          },
        ],
      );
    }
    if (settlement.differenceDue > 0) {
      payments = await resolveExchangePayments(
        input.payments ?? [],
        settlement.differenceDue,
        lang,
      );
      const checked = priceExchangeSettlement({
        returnCredit: initialReturn.totals,
        exchangePriced,
        payments,
      });
      if (checked.tender.due > 0) {
        throw refuse(ERROR_CODES.CONFLICT, 'The exchange difference is not fully paid', [
          { path: 'payments', message: V.MONEY_INVALID, due: checked.tender.due },
        ]);
      }
      if (
        checked.tender.change > 0 &&
        !PAYMENT_METHOD.CHANGE_TYPES.includes(payments.at(-1)?.methodType)
      ) {
        throw refuse(ERROR_CODES.CONFLICT, 'Only cash can be overpaid', [
          { path: `payments.${payments.length - 1}.amount`, message: V.MONEY_INVALID },
        ]);
      }
      settlement = checked;
    }
  }

  const openShift = await providers.findOpenShift({
    branchId,
    staffId: actor.staffId,
  });

  let outcome;
  try {
    outcome = await withTransaction(async (session) => {
      const freshOrder = await findOrderForReturn(order._id, session);
      assertOrderReturnable(actor, freshOrder, branchId);
      const freshPrior = await repo.listByOrderId(freshOrder._id, session);
      const freshReturn = priceReturnedLines(
        freshOrder.items,
        input.returnLines,
        buildPriorReturnedMap(freshPrior),
      );
      throwIfReturnIssues(freshReturn.issues);

      const returnId = new mongoose.Types.ObjectId();
      const seqName = isExchange ? 'exchange' : 'return';
      const prefix = isExchange ? RETURN_EXCHANGE.EXCHANGE_PREFIX : RETURN_EXCHANGE.RETURN_PREFIX;
      const returnNo = formatSequence(await nextSequence(seqName, { session }), {
        prefix,
        pad: 6,
      });

      const stockResults = [];
      const stockOpsMeta = [];

      const restockLines = aggregateVariantLines(
        freshReturn.lines.filter((l) => l.disposition === 'restock'),
      );
      if (restockLines.length > 0) {
        const op = await applyStockOperation(
          {
            type: 'return',
            branchId,
            lines: restockLines,
            ref: { type: 'returnExchange', id: str(returnId) },
            note: `${returnNo} (${freshOrder.orderNo})`,
          },
          { session, actorId: actor.staffId, idempotencyKey: key ? `${key}:restock` : null },
        );
        stockResults.push(op);
        stockOpsMeta.push({
          branchId: op.operation.branchId,
          operationId: op.operation._id,
          type: 'return',
          docNo: op.operation.docNo ?? returnNo,
        });
      }

      const damagedLines = aggregateVariantLines(
        freshReturn.lines.filter((l) => l.disposition === 'damaged'),
      );
      if (damagedLines.length > 0) {
        const retOp = await applyStockOperation(
          {
            type: 'return',
            branchId,
            lines: damagedLines,
            ref: { type: 'returnExchange', id: str(returnId) },
            note: `${returnNo} (${freshOrder.orderNo} damaged return)`,
          },
          { session, actorId: actor.staffId, idempotencyKey: key ? `${key}:dmg-ret` : null },
        );
        stockResults.push(retOp);
        stockOpsMeta.push({
          branchId: retOp.operation.branchId,
          operationId: retOp.operation._id,
          type: 'return',
          docNo: retOp.operation.docNo ?? returnNo,
        });

        const adjOp = await applyStockOperation(
          {
            type: 'adjust',
            branchId,
            reason: 'damaged',
            lines: damagedLines.map((l) => ({ variantId: l.variantId, delta: -l.qty })),
            ref: { type: 'returnExchange', id: str(returnId) },
            note: `${returnNo} (${freshOrder.orderNo} damaged write-off)`,
          },
          { session, actorId: actor.staffId, idempotencyKey: key ? `${key}:dmg-adj` : null },
        );
        stockResults.push(adjOp);
        stockOpsMeta.push({
          branchId: adjOp.operation.branchId,
          operationId: adjOp.operation._id,
          type: 'adjust',
          docNo: adjOp.operation.docNo,
        });
      }

      if (isExchange && exchangePriced.items.length > 0) {
        const saleLines = aggregateVariantLines(exchangePriced.items);
        const saleOp = await applyStockOperation(
          {
            type: 'sale',
            branchId,
            lines: saleLines,
            ref: { type: 'returnExchange', id: str(returnId) },
            note: `${returnNo} (${freshOrder.orderNo} exchange)`,
          },
          { session, actorId: actor.staffId, idempotencyKey: key ? `${key}:exc-sale` : null },
        );
        stockResults.push(saleOp);
        stockOpsMeta.push({
          branchId: saleOp.operation.branchId,
          operationId: saleOp.operation._id,
          type: 'sale',
          docNo: saleOp.operation.docNo ?? returnNo,
        });
      }

      const nextStatus = isExchange
        ? 'exchanged'
        : freshReturn.fullyReturned
          ? 'refunded'
          : 'partially_returned';
      const refundAmount = isExchange ? 0 : freshReturn.totals.total;

      const updatedOrder = await applyOrderReturnOutcome(
        freshOrder._id,
        freshOrder.status,
        {
          status: nextStatus,
          refundDelta: refundAmount,
          markPaymentRefunded: !isExchange && freshReturn.fullyReturned,
          historyEntry: {
            at: new Date(),
            from: freshOrder.status,
            to: nextStatus,
            action: isExchange ? 'exchange' : 'return',
            by: 'staff',
            staffId: actor.staffId ? oid(actor.staffId) : null,
            reason: input.reason ?? null,
            restocked: restockLines.length > 0,
          },
        },
        session,
      );
      if (!updatedOrder) {
        throw new ConflictError('Order changed while processing return — please retry');
      }

      const created = await repo.insertReturnExchange(
        {
          _id: returnId,
          returnNo,
          type: input.type,
          orderId: freshOrder._id,
          orderNo: freshOrder.orderNo,
          channel: freshOrder.channel ?? 'pos',
          branchId: oid(branchId),
          shiftId: openShift ? oid(openShift.id) : null,
          customer: {
            customerId: freshOrder.customer?.customerId ?? null,
            name: freshOrder.customer?.name ?? '',
            phone: freshOrder.customer?.phone ?? '',
            email: freshOrder.customer?.email ?? null,
          },
          returnLines: freshReturn.lines.map((l) => ({
            ...l,
            productId: oid(l.productId),
            variantId: oid(l.variantId),
          })),
          returnTotals: freshReturn.totals,
          exchangeLines: exchangePriced.items,
          exchangeTotals: exchangePriced.totals,
          refundMethod: isExchange ? null : (input.refundMethod ?? 'cash'),
          refundAmount,
          differenceDue: isExchange ? (settlement?.differenceDue ?? 0) : 0,
          payments,
          changeGiven: isExchange ? (settlement?.tender?.change ?? 0) : 0,
          stockOperations: stockOpsMeta,
          staffId: actor.staffId ? oid(actor.staffId) : null,
          reason: input.reason ?? '',
          note: input.note ?? '',
          idempotencyKey: key,
        },
        session,
      );

      return { created, stockResults, freshOrder };
    });
  } catch (err) {
    if (key && isDuplicateKey(err, 'idempotencyKey')) {
      const existing = await repo.findByIdempotencyKey(key);
      if (existing) return { record: await toReturnDto(existing), replayed: true };
    }
    throw err;
  }

  outcome.stockResults.forEach(publishStockResult);
  const created = outcome.created;

  const eventPayload = {
    returnId: str(created._id),
    returnNo: created.returnNo,
    type: created.type,
    orderId: str(created.orderId),
    orderNo: created.orderNo,
    branchId: str(created.branchId),
    customerId: str(created.customer?.customerId),
    actorId: actor.staffId ?? null,
    returnTotal: created.returnTotals.total,
    refundAmount: created.refundAmount,
    refundMethod: created.refundMethod,
    differenceDue: created.differenceDue,
  };

  void eventBus.emit(
    isExchange ? EVENTS.EXCHANGE_COMPLETED : EVENTS.RETURN_COMPLETED,
    eventPayload,
  );

  // When a customer returns goods for a refund, emit LOYALTY_REVERSED so P7.1's loyalty ledger
  // subscriber claws back the points earned on the returned amount.
  if (!isExchange && created.customer?.customerId && created.returnTotals.total > 0) {
    void eventBus.emit(EVENTS.LOYALTY_REVERSED, {
      returnId: str(created._id),
      returnNo: created.returnNo,
      orderId: str(created.orderId),
      orderNo: created.orderNo,
      customerId: str(created.customer.customerId),
      amount: created.returnTotals.total,
      actorId: actor.staffId ?? null,
    });
  }

  return { record: await toReturnDto(created), replayed: false };
}

export async function getReturnExchange(actor, id) {
  const doc = await repo.findById(id);
  if (!doc) throw new NotFoundError('Return/exchange record not found');
  actor.assertBranch(str(doc.branchId));
  return toReturnDto(doc);
}

export async function listReturnExchanges(
  actor,
  { page, limit, sort, branchId, orderId, type, q },
) {
  if (branchId) actor.assertBranch(branchId);
  const filter = {
    ...(branchId ? { branchId: oid(branchId) } : actor.branchFilter('branchId')),
    ...(orderId && { orderId: oid(orderId) }),
    ...(type && { type }),
    ...(q && {
      $or: [
        { returnNo: new RegExp(`^${q.trim().toUpperCase()}`) },
        { orderNo: new RegExp(`^${q.trim().toUpperCase()}`) },
      ],
    }),
  };
  const { items, total } = await repo.listReturnExchanges(filter, {
    sort: { [sort.field]: sort.direction },
    skip: (page - 1) * limit,
    limit,
  });
  const dtos = await Promise.all(items.map(toReturnDto));
  return { data: dtos, meta: { page, limit, total } };
}

export async function printReturnReceipt(actor, id, { profileId } = {}) {
  const dto = await getReturnExchange(actor, id);
  return buildReturnReceiptJob(dto, { profileId, branchId: dto.branchId });
}

async function toReturnDto(doc) {
  const [branches, staff] = await Promise.all([
    doc.branchId ? getBranchSummaries([str(doc.branchId)]) : new Map(),
    doc.staffId ? getStaffNames([str(doc.staffId)]) : new Map(),
  ]);
  const branch = branches.get(str(doc.branchId));
  const branchName = branch?.name?.en ?? branch?.code ?? '';
  const staffName = staff.get(str(doc.staffId))?.name ?? '';
  const shop = {
    name: getSetting('store.name'),
    vatNumber: getSetting('tax.vatNumber'),
  };
  const qr = zatcaQr({
    sellerName: shop.name,
    vatNumber: shop.vatNumber,
    timestamp: doc.createdAt,
    total: doc.type === 'exchange' ? (doc.differenceDue ?? 0) : (doc.returnTotals?.total ?? 0),
    vat:
      doc.type === 'exchange'
        ? Math.max(0, (doc.exchangeTotals?.vat ?? 0) - (doc.returnTotals?.vat ?? 0))
        : (doc.returnTotals?.vat ?? 0),
  });

  const base = {
    id: str(doc._id),
    returnNo: doc.returnNo,
    type: doc.type,
    orderId: str(doc.orderId),
    orderNo: doc.orderNo,
    channel: doc.channel,
    branchId: str(doc.branchId),
    branchName,
    shiftId: str(doc.shiftId),
    customer: {
      customerId: str(doc.customer?.customerId),
      name: doc.customer?.name ?? '',
      phone: doc.customer?.phone ?? '',
      email: doc.customer?.email ?? null,
    },
    returnLines: (doc.returnLines ?? []).map((l) => ({
      ...l,
      productId: str(l.productId),
      variantId: str(l.variantId),
    })),
    returnTotals: doc.returnTotals,
    exchangeLines: (doc.exchangeLines ?? []).map((l) => ({
      ...l,
      productId: str(l.productId),
      variantId: str(l.variantId),
    })),
    exchangeTotals: doc.exchangeTotals ?? null,
    refundMethod: doc.refundMethod ?? null,
    refundAmount: doc.refundAmount ?? 0,
    differenceDue: doc.differenceDue ?? 0,
    payments: (doc.payments ?? []).map((p) => ({
      method: p.method,
      label: p.label ?? p.method,
      amount: p.amount,
      reference: p.reference ?? null,
      at: p.at,
    })),
    changeGiven: doc.changeGiven ?? 0,
    stockOperations: (doc.stockOperations ?? []).map((op) => ({
      branchId: str(op.branchId),
      operationId: str(op.operationId),
      type: op.type,
      docNo: op.docNo,
    })),
    staffId: str(doc.staffId),
    staffName,
    reason: doc.reason ?? '',
    note: doc.note ?? '',
    zatcaQr: qr || null,
    createdAt: doc.createdAt,
  };

  const receipt = renderReturnReceipt(base, {
    shop,
    branch: branchName,
    cashier: staffName,
    currency: getSetting('store.currency'),
    timeZone: getSetting('store.timeZone'),
  });

  return {
    ...base,
    receiptLines: receipt.lines,
  };
}

/**
 * Returns dashboard return and exchange aggregations for overview.
 */
export async function getDashboardReturnStats({ currentFilter, previousFilter, recentFilter }) {
  const [current, previous, byChannel, recentReturns] = await Promise.all([
    repo.getReturnExchangeAggregate(currentFilter),
    repo.getReturnExchangeAggregate(previousFilter),
    repo.getReturnChannelBreakdown(currentFilter),
    repo.getRecentReturns(recentFilter, 5),
  ]);

  return {
    current,
    previous,
    byChannel,
    recentReturns,
  };
}

/**
 * Generates returns and exchanges report statistics by dimension.
 */
export async function getReturnsReportStats({
  dimension = 'all',
  start,
  end,
  branchId = null,
  channel = 'all',
  limit = 50,
  sortBy = 'refundAmount',
  sortDir = 'desc',
}) {
  const matchFilter = {
    createdAt: { $gte: start, $lte: end },
  };

  if (branchId) {
    matchFilter.branchId = oid(branchId);
  }

  if (channel && channel !== 'all') {
    matchFilter.channel = channel;
  }

  let items = [];
  switch (dimension) {
    case 'product':
      items = await repo.getReturnStatsByProduct(matchFilter, { limit, sortBy, sortDir });
      break;
    case 'category':
      items = await repo.getReturnStatsByCategory(matchFilter, { limit, sortBy, sortDir });
      break;
    case 'staff':
      items = await repo.getReturnStatsByStaff(matchFilter, { limit, sortBy, sortDir });
      break;
    case 'branch':
      items = await repo.getReturnStatsByBranch(matchFilter, { limit, sortBy, sortDir });
      break;
    case 'online':
    case 'channel':
      items = await repo.getReturnStatsByChannel(matchFilter, { limit, sortBy, sortDir });
      break;
    case 'all':
    default:
      items = await repo.getReturnStatsAll(matchFilter, { limit, sortBy, sortDir });
      break;
  }

  const totals = await repo.getReturnExchangeAggregate(matchFilter);

  return {
    items,
    totals,
  };
}
