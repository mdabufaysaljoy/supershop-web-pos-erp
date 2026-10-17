import {
  ERROR_CODES,
  EVENTS,
  ORDER,
  PAYMENT_METHOD,
  PERMISSIONS as P,
  POS,
  priceSale,
  SOURCE_LANGUAGE,
  tenderSummary,
  vatRateFor,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import mongoose from 'mongoose';
import { formatSequence, nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, ForbiddenError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import { applyStockOperation, getOnHand, publishStockResult } from '../inventory/index.js';
import { availableMethods, resolveForCheckout } from '../paymentMethods/index.js';
import { getCartVariants, matchVariantIds } from '../products/index.js';
import { getSetting } from '../settings/index.js';
import * as repo from './order.repo.js';
import { toStaffOrderDto } from './order.service.js';

/**
 * Selling at the counter (P6.1). A sale is an order like any other — same collection, same
 * lifecycle, same ledger — created `paid` and `completed` in ONE transaction, because the goods
 * and the money change hands at the same moment.
 *
 * Prices, VAT and totals are decided HERE from the catalogue and the shop's settings; the till
 * sends what the cashier did (items, discounts, who is paying, how) and never a total. Discounts
 * and price overrides each need their own permission, and a percentage discount is capped by
 * `pos.maxDiscountBps`.
 */
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));

/** Customer lookup by phone/email — injected at the composition root (keeps orders one-way). */
let findCustomerByContact = async () => null;
export function setPosCustomerLookup(fn) {
  findCustomerByContact = fn;
}

/** Active shift lookup for a counter sale (P6.5) — injected at the composition root. */
let findOpenShiftForSale = async () => null;
export function setPosShiftResolver(fn) {
  findOpenShiftForSale = fn;
}

export const listOrdersForShift = (shiftId, session) => repo.listByShift(shiftId, session);

const refuse = (code, message, details) => new AppError(code, message, { status: 409, details });

const outOfStock = (details) =>
  refuse(ERROR_CODES.INSUFFICIENT_STOCK, 'Not enough stock at this branch', details);

/** The catalogue's word on each scanned line: what it is, what it costs, how it is taxed. */
async function readLines(actor, items, lang) {
  const variants = await getCartVariants(
    items.map((i) => i.variantId),
    lang,
  );
  // Changing a price or giving a discount are each their own permission (§5.2): the cashier
  // either may or may not, and being told so plainly beats a field error.
  if (items.some((i) => i.unitPrice !== undefined) && !actor.can(P.POS_PRICE_OVERRIDE))
    throw new ForbiddenError('Changing a price needs permission');
  if (items.some((i) => i.discount) && !actor.can(P.POS_DISCOUNT))
    throw new ForbiddenError('Giving a discount needs permission');
  const details = [];

  const lines = items.map((item, i) => {
    const variant = variants.get(String(item.variantId));
    if (!variant || !variant.sellable)
      details.push({ path: `items.${i}.variantId`, message: V.ID_INVALID });
    return {
      ...variant,
      qty: item.qty,
      unitPrice: item.unitPrice ?? variant?.price ?? 0,
      discount: item.discount ?? null,
    };
  });
  if (details.length) throw new ValidationError(details, 'This sale cannot be rung up');
  return lines;
}

/** Everything the customer is paying for, priced the one way (shared `priceSale`). */
function priceForSale(lines, orderDiscount) {
  const tax = {
    vatRateBps: getSetting('tax.vatRateBps'),
    pricesIncludeVat: getSetting('tax.pricesIncludeVat'),
  };
  const priced = priceSale(
    lines.map((l) => ({
      unitPrice: l.unitPrice,
      qty: l.qty,
      taxCategory: l.taxCategory,
      discount: l.discount,
    })),
    { orderDiscount, tax },
  );
  const items = lines.map((l, i) => ({
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
    items,
    totals: {
      itemCount: priced.totals.itemCount,
      subtotal: priced.totals.subtotal,
      discountTotal: priced.totals.discountTotal,
      deliveryFee: 0,
      paymentFee: 0,
      net: priced.totals.net,
      vat: priced.totals.vat,
      total: priced.totals.total,
    },
    pricesIncludeVat: tax.pricesIncludeVat,
  };
}

/** A basket discount beyond the shop's cap, or more than the basket, is refused — never clamped. */
function assertDiscountsFit(actor, input, priced) {
  if (input.orderDiscount && !actor.can(P.POS_DISCOUNT))
    throw new ForbiddenError('Giving a discount needs permission');
  const details = [];
  const cap = getSetting('pos.maxDiscountBps');
  if (input.orderDiscount?.type === 'percent' && input.orderDiscount.value > cap)
    details.push({ path: 'orderDiscount.value', message: V.TOO_LONG });
  if (input.orderDiscount?.type === 'amount' && input.orderDiscount.value > priced.totals.subtotal)
    details.push({ path: 'orderDiscount.value', message: V.TOO_LONG });
  for (const [i, item] of input.items.entries()) {
    if (item.discount?.type === 'percent' && item.discount.value > cap)
      details.push({ path: `items.${i}.discount.value`, message: V.TOO_LONG });
    if (
      item.discount?.type === 'amount' &&
      item.discount.value > item.qty * (priced.items[i]?.unitPrice ?? 0)
    )
      details.push({ path: `items.${i}.discount.value`, message: V.TOO_LONG });
  }
  if (details.length) throw new ValidationError(details, 'That discount is too large');
}

/** What is on the shelf of THIS branch — the till cannot sell another branch's stock. */
async function assertOnShelf(branchId, items) {
  if (getSetting('pos.allowOversell')) return;
  const onHand = await getOnHand(
    branchId,
    items.map((i) => str(i.variantId)),
  );
  const wanted = new Map();
  for (const item of items)
    wanted.set(str(item.variantId), (wanted.get(str(item.variantId)) ?? 0) + item.qty);
  const short = [...wanted.entries()].filter(([id, qty]) => (onHand.get(id) ?? 0) < qty);
  if (short.length)
    throw outOfStock(
      short.map(([id, qty]) => {
        const item = items.find((i) => str(i.variantId) === id);
        return {
          path: `items.${id}`,
          message: V.QTY_INSUFFICIENT,
          variantId: id,
          name: item?.name,
          wanted: qty,
          available: onHand.get(id) ?? 0,
        };
      }),
    );
}

/**
 * The methods behind the cashier's tenders, snapshotted (a method may later be renamed or
 * switched off; a receipt may not change). Only methods meant for a counter are accepted — a
 * gateway sends the CUSTOMER to a payment page, which is not what happens here.
 */
async function resolvePayments(tenders, total, lang) {
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
  if (details.length) throw new ValidationError(details, 'That payment method cannot be used here');
  return payments;
}

/** Who the sale is for: an existing customer when their phone/email is known, else just a name. */
async function attachCustomer(customer) {
  if (customer.mode !== 'contact')
    return { customerId: null, name: 'Walk-in customer', phone: '', email: null };
  const found = await findCustomerByContact({ phone: customer.phone, email: customer.email });
  return {
    customerId: found ? oid(found.id) : null,
    name: customer.name ?? found?.name ?? 'Walk-in customer',
    phone: customer.phone ?? found?.phone ?? '',
    email: customer.email ?? found?.email ?? null,
  };
}

/**
 * Scan or type at the till: a barcode, a SKU, or part of a name → what can be rung up, priced,
 * with what is on this branch's shelf. One request, and it needs only `pos.sell` — a cashier is
 * not given the run of the catalogue to be able to sell.
 */
export async function searchForTill(actor, { q, branchId, limit = 10 }, lang = SOURCE_LANGUAGE) {
  actor.assertBranch(branchId);
  const ids = await matchVariantIds(q, limit);
  if (!ids.length) return [];
  const [variants, onHand] = await Promise.all([
    getCartVariants(ids.map(String), lang),
    getOnHand(branchId, ids.map(String)),
  ]);
  return ids
    .map((id) => variants.get(String(id)))
    .filter((v) => v?.sellable)
    .map((v) => ({
      variantId: v.variantId,
      productId: v.productId,
      name: v.name,
      options: v.options,
      sku: v.sku,
      price: v.price,
      image: v.image ? { url: v.image.thumbUrl ?? v.image.url } : null,
      onHand: onHand.get(String(v.variantId)) ?? 0,
    }));
}

/** What the sale comes to, before anyone pays — the till asks for this as the cashier scans. */
export async function quotePosSale(actor, input, { lang = SOURCE_LANGUAGE } = {}) {
  actor.assertBranch(input.branchId);
  const lines = await readLines(actor, input.items, lang);
  const priced = priceForSale(lines, input.orderDiscount ?? null);
  assertDiscountsFit(actor, input, priced);
  return {
    items: priced.items.map((i) => ({
      ...i,
      productId: str(i.productId),
      variantId: str(i.variantId),
    })),
    totals: priced.totals,
    tender: tenderSummary(priced.totals.total, input.payments ?? []),
    methods: await availableMethods({ total: priced.totals.total, lang, channel: 'pos' }),
  };
}

/**
 * Rings a sale up: stock leaves the branch, the money is recorded and the order is completed, all
 * in one transaction. Retrying with the same `Idempotency-Key` returns the first sale instead of
 * selling twice — a till that loses its connection mid-sale is the normal case, not the odd one.
 */
export async function createPosSale(actor, input, { idempotencyKey = null } = {}) {
  actor.assertBranch(input.branchId);
  const lang = input.lang ?? SOURCE_LANGUAGE;
  const key = idempotencyKey ? `pos:${actor.staffId}:${idempotencyKey}` : null;
  if (key) {
    const existing = await repo.findByIdempotencyKey(key);
    if (existing) return { sale: toPosSaleDto(existing), replayed: true };
  }

  const lines = await readLines(actor, input.items, lang);
  const priced = priceForSale(lines, input.orderDiscount ?? null);
  assertDiscountsFit(actor, input, priced);
  await assertOnShelf(input.branchId, priced.items);

  const payments = await resolvePayments(input.payments, priced.totals.total, lang);
  const tender = tenderSummary(priced.totals.total, payments);
  if (tender.due > 0)
    throw refuse(ERROR_CODES.CONFLICT, 'The sale is not fully paid', [
      { path: 'payments', message: V.MONEY_INVALID, due: tender.due },
    ]);
  // Change comes out of the drawer: only cash can be overpaid. A card or a transfer is for the
  // exact amount, and an overpayment there is a mistake worth stopping.
  if (tender.change > 0 && !PAYMENT_METHOD.CHANGE_TYPES.includes(payments.at(-1).methodType))
    throw refuse(ERROR_CODES.CONFLICT, 'Only cash can be overpaid', [
      { path: `payments.${payments.length - 1}.amount`, message: V.MONEY_INVALID },
    ]);

  const customer = await attachCustomer(input.customer ?? { mode: 'walkin' });
  const openShift = await findOpenShiftForSale({
    branchId: input.branchId,
    staffId: actor.staffId,
  });
  if (!openShift && getSetting('pos.requireOpenShift'))
    throw refuse(ERROR_CODES.SHIFT_NOT_OPEN, 'Open a shift before ringing up a sale');
  const at = new Date();

  let outcome;
  try {
    outcome = await withTransaction(async (session) => {
      const orderId = new mongoose.Types.ObjectId();
      const stock = await applyStockOperation(
        {
          type: 'sale',
          branchId: input.branchId,
          lines: priced.items.map((i) => ({ variantId: str(i.variantId), qty: i.qty })),
          ref: { type: 'order', id: str(orderId) },
          note: '',
        },
        { session, actorId: actor.staffId, idempotencyKey: key ? `${key}:stock` : null },
      );
      const orderNo = formatSequence(await nextSequence('posSale', { session }), {
        prefix: ORDER.POS_NUMBER_PREFIX,
        pad: 6,
      });
      const history = (to, action) => ({
        at,
        from: to === 'paid' ? 'pending' : 'paid',
        to,
        action,
        by: 'staff',
        staffId: actor.staffId ? oid(actor.staffId) : null,
        reason: null,
        restocked: false,
      });
      const created = await repo.insertOrder(
        {
          _id: orderId,
          orderNo,
          channel: 'pos',
          // The goods and the money changed hands at the counter: nothing is left to do.
          status: 'completed',
          lang,
          customer,
          deliveryMethod: 'pickup',
          address: null,
          items: priced.items,
          totals: priced.totals,
          currency: getSetting('store.currency'),
          pricesIncludeVat: priced.pricesIncludeVat,
          payment: {
            // The summary of a split: the method that paid the most, and paid in full.
            method: [...payments].sort((a, b) => b.amount - a.amount)[0].method,
            methodType: [...payments].sort((a, b) => b.amount - a.amount)[0].methodType,
            label: [...payments].sort((a, b) => b.amount - a.amount)[0].label,
            fee: 0,
            status: 'paid',
          },
          payments,
          changeGiven: tender.change,
          staffId: actor.staffId ? oid(actor.staffId) : null,
          shiftId: openShift ? oid(openShift.id) : null,
          note: input.note ?? '',
          fulfillment: [
            {
              branchId: stock.operation.branchId,
              operationId: stock.operation._id,
              docNo: stock.operation.docNo,
            },
          ],
          branchId: oid(input.branchId),
          statusHistory: [history('paid', 'markPaid'), history('completed', 'complete')],
          idempotencyKey: key,
          placedAt: at,
        },
        session,
      );
      return { order: created, stock };
    });
  } catch (err) {
    if (key && isDuplicateKey(err, 'idempotencyKey')) {
      const existing = await repo.findByIdempotencyKey(key);
      if (existing) return { sale: toPosSaleDto(existing), replayed: true };
    }
    if (err?.code === ERROR_CODES.INSUFFICIENT_STOCK)
      throw outOfStock(
        (err.details ?? []).map((d) => ({ ...d, path: d.path.replace(/^lines\./, 'items.') })),
      );
    throw err;
  }

  publishStockResult(outcome.stock);
  const order = outcome.order;
  const payload = {
    orderId: str(order._id),
    orderNo: order.orderNo,
    channel: 'pos',
    branchId: str(order.branchId),
    staffId: str(order.staffId),
    shiftId: str(order.shiftId),
    customerId: str(order.customer.customerId),
    total: order.totals.total,
    itemCount: order.totals.itemCount,
    paymentMethod: order.payment.method,
    lang,
  };
  void eventBus.emit(EVENTS.ORDER_CREATED, payload);
  // Loyalty (P7.1), tracking (P9) and the receipt all hang off these two, not off this service.
  void eventBus.emit(EVENTS.ORDER_PAID, payload);
  void eventBus.emit(EVENTS.ORDER_COMPLETED, payload);

  return { sale: toPosSaleDto(order), replayed: false };
}

/** What the till shows after a sale — the staff view already carries the tenders and the change. */
export const toPosSaleDto = (order) => toStaffOrderDto(order);

export { POS };
