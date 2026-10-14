import {
  ACTORS,
  deliveryCharge,
  ERROR_CODES,
  EVENTS,
  findTransition,
  normalizeDigits,
  ORDER,
  orderTotals,
  paymentCharge,
  priceLines,
  vatRateFor,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import mongoose from 'mongoose';
import { formatSequence, nextSequence } from '../../core/counter.js';
import { randomToken, sha256 } from '../../core/crypto.js';
import { withTransaction } from '../../core/db.js';
import { AppError, ConflictError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { isDuplicateKey } from '../../core/slug.js';
import { emptyCartForOrder, getCheckoutCart } from '../cart/index.js';
import { validateCustomValues } from '../customFields/index.js';
import {
  applyStockOperation,
  getOnlineStockByBranch,
  publishStockResult,
} from '../inventory/index.js';
import { getSetting } from '../settings/index.js';
import { getStaffNames } from '../staff/index.js';
import * as repo from './order.repo.js';
import { moveOrder, nextActions } from './order.states.js';
import { allocateStock } from './stockAllocation.js';

/**
 * Checkout (P3.4). One transaction turns a cart into an order:
 *   cart lines → fresh catalog prices & VAT → stock taken from the online branches (ledger `sale`
 *   movements, so stock can never be oversold) → numbered order → cart emptied.
 * Anything that fails rolls everything back. `Idempotency-Key` makes a retried submit return the
 * first order instead of placing a second one.
 *
 * Payment is recorded as chosen but not captured — gateways arrive with P4.1, so orders start as
 * `pending` and the order state machine (P4.3) takes them onward.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));
/** The newest parcel, as the customer may see it. */
const latestShipment = (o) => {
  const shipment = (o.shipments ?? []).at(-1);
  return shipment
    ? {
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber ?? null,
        trackingUrl: shipment.trackingUrl ?? null,
        shippedAt: shipment.shippedAt,
      }
    : null;
};
const escapeRegExp = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The last 9 digits of what was typed, or null when it is not phone-like. */
const phoneTail = (q) => {
  const digits = normalizeDigits(String(q)).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-9) : null;
};
const ATTEMPTS = 3;

const cartEmpty = () => new AppError(ERROR_CODES.CART_EMPTY, 'Your cart is empty', { status: 409 });
const priceChanged = (details) =>
  new AppError(ERROR_CODES.PRICE_CHANGED, 'Prices changed, please review your cart', {
    status: 409,
    details,
  });
const outOfStock = (details) =>
  new AppError(ERROR_CODES.OUT_OF_STOCK, 'Some items are no longer available', {
    status: 409,
    details,
  });

// ---------------------------------------------------------------- payment hooks

/**
 * The payments module plugs itself in here (wired in modules/index.js), so orders never import
 * payments while payments import orders — one direction, no cycle (as with the auth policy, D-023).
 * @type {{ start: Function | null, sync: Function | null }}
 */
const paymentHooks = { start: null, sync: null };

/**
 * Payment methods are data (P4.2): the composition root injects the lookup so orders never read
 * the methods collection themselves. Without it (older tests), only the built-in keys are allowed.
 * @type {null | ((key: string, ctx: { total: number }) => Promise<{ method: object, fee: number }>)}
 */
let resolveMethod = null;
export const setPaymentMethodResolver = (fn) => {
  resolveMethod = fn;
};

const resolveCheckoutMethod = async (key, ctx) =>
  resolveMethod
    ? resolveMethod(key, ctx)
    : { method: { key, type: key === 'card' ? 'gateway' : 'cod', label: { en: key } }, fee: 0 };

/** The label the customer saw, in the order's language, kept with the order. */
const methodLabel = (method, lang) =>
  typeof method.label === 'string'
    ? method.label
    : (method.label?.[lang] ?? method.label?.en ?? method.key);

/** @param {{ start: Function, sync: Function }} hooks */
export const setPaymentHooks = (hooks) => Object.assign(paymentHooks, hooks);

/**
 * A gateway (or the till) decided where the money is. Orders own their own status: `paid` moves a
 * pending order forward, `refunded` closes it, and a failed attempt leaves the order pending so
 * the customer can try again (cancellation + restock is the state machine's job, P4.3).
 * @param {string} orderId
 * @param {{ status: string, method: string, gatewayRef?: string | null, refundedAmount?: number }} outcome
 */
export async function applyPaymentOutcome(orderId, outcome) {
  const order = await repo.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const updated = await repo.updatePaymentState(orderId, {
    'payment.status': outcome.status,
    ...(outcome.gatewayRef !== undefined && { 'payment.gatewayRef': outcome.gatewayRef }),
    ...(outcome.refundedAmount !== undefined && {
      'payment.refundedAmount': outcome.refundedAmount,
    }),
  });

  // Where the money is and where the ORDER is are two different things: the lifecycle decides the
  // second, through its own config and guards (P4.3). A failed attempt leaves the order alone so
  // the customer can try again.
  const to = outcome.status === 'paid' ? 'paid' : outcome.status === 'refunded' ? 'refunded' : null;
  if (!to || !findTransition(updated.status, to)) return updated;
  const { order: moved } = await moveOrder(orderId, to, { by: ACTORS.SYSTEM });
  return moved;
}

// ---------------------------------------------------------------- order view

/** What the storefront shows after checkout (and on the confirmation page). */
export const toOrderDto = (o, { token, redirectUrl } = {}) => ({
  id: str(o._id),
  orderNo: o.orderNo,
  status: o.status,
  lang: o.lang,
  placedAt: o.placedAt,
  customer: { name: o.customer.name, phone: o.customer.phone, email: o.customer.email ?? null },
  deliveryMethod: o.deliveryMethod,
  address: o.address ?? null,
  items: o.items.map((i) => ({
    productId: str(i.productId),
    variantId: str(i.variantId),
    sku: i.sku,
    name: i.name,
    options: i.options ?? [],
    image: i.imageUrl ?? null,
    unitPrice: i.unitPrice,
    qty: i.qty,
    lineTotal: i.lineTotal,
  })),
  totals: o.totals,
  currency: o.currency,
  pricesIncludeVat: o.pricesIncludeVat,
  payment: {
    method: o.payment.method,
    type: o.payment.methodType ?? 'cod',
    label: o.payment.label ?? null,
    fee: o.payment.fee ?? 0,
    status: o.payment.status,
  },
  /** The parcel on its way, if there is one (P4.3) — carrier and tracking, nothing internal. */
  shipment: latestShipment(o),
  customFields: o.customFields ?? {},
  note: o.note ?? '',
  ...(token && { confirmationToken: token }),
  /** Where to send the customer to pay, when the method needs a payment page (P4.1). */
  ...(redirectUrl
    ? { payment: { method: o.payment.method, status: o.payment.status, redirectUrl } }
    : {}),
});

// ---------------------------------------------------------------- placing an order

/** Cart lines that can actually be ordered; anything else stops checkout with a clear reason. */
function sellableLines(view) {
  if (!view.items.length) throw cartEmpty();
  const blocked = view.items.filter((i) => i.status !== 'ok');
  if (blocked.length) {
    throw outOfStock(
      blocked.map((i) => ({
        path: `items.${i.variantId}`,
        message: V.QTY_INSUFFICIENT,
        variantId: i.variantId,
        name: i.name,
        status: i.status,
      })),
    );
  }
  // A price or quantity the shopper has not seen yet: let them confirm the new cart first.
  const changed = view.items.filter((i) => i.notices.length);
  if (changed.length) {
    throw priceChanged(
      changed.map((i) => ({
        path: `items.${i.variantId}`,
        message: V.INVALID_TYPE,
        variantId: i.variantId,
        name: i.name,
        notices: i.notices,
      })),
    );
  }
  return view.items;
}

/** Every address key is stored (missing ones as null) so receipts and admin screens are stable. */
const ADDRESS_KEYS = [
  'city',
  'line1',
  'district',
  'buildingNumber',
  'postalCode',
  'additionalNumber',
  'shortAddress',
  'landmark',
];
const cleanAddress = (a = {}) => Object.fromEntries(ADDRESS_KEYS.map((k) => [k, a?.[k] ?? null]));

/** Snapshot lines + totals from the (already revalidated) cart view. */
function buildOrderLines(items, methodFee = 0) {
  const tax = {
    vatRateBps: getSetting('tax.vatRateBps'),
    pricesIncludeVat: getSetting('tax.pricesIncludeVat'),
  };
  const priced = priceLines(
    items.map((i) => ({ unitPrice: i.unitPrice, qty: i.qty, taxCategory: i.taxCategory })),
    tax,
  );
  const lines = items.map((i, n) => ({
    productId: oid(i.productId),
    variantId: oid(i.variantId),
    sku: i.sku ?? '',
    name: i.name,
    options: i.options ?? [],
    imageUrl: i.image?.thumbUrl ?? i.image?.url ?? null,
    unitPrice: i.unitPrice,
    qty: i.qty,
    taxCategory: i.taxCategory ?? 'standard',
    vatRateBps: vatRateFor(i.taxCategory ?? 'standard', { standardRateBps: tax.vatRateBps }),
    lineTotal: priced.lines[n].lineTotal,
    net: priced.lines[n].net,
    vat: priced.lines[n].vat,
  }));
  const delivery = deliveryCharge({
    fee: getSetting('checkout.deliveryFee'),
    itemsTotal: priced.totals.total,
    freeOver: getSetting('checkout.freeDeliveryOver'),
    taxed: getSetting('checkout.taxDelivery'),
    ...tax,
  });
  // The payment fee is charged on what the customer already owes (goods + delivery), P4.2.
  const payment = paymentCharge({
    fee: methodFee,
    taxed: getSetting('checkout.taxDelivery'),
    ...tax,
  });
  return { lines, totals: orderTotals(priced.totals, delivery, payment), tax };
}

/** Books the stock for an order across the online branches, inside the order's transaction. */
async function takeStock(lines, orderId, session) {
  const needs = lines.map((l) => ({ variantId: str(l.variantId), qty: l.qty }));
  const stock = await getOnlineStockByBranch(
    needs.map((n) => n.variantId),
    { session },
  );
  const { allocation, short } = allocateStock(needs, stock);
  if (short.length) {
    throw outOfStock(
      short.map((s) => {
        const line = lines.find((l) => str(l.variantId) === s.variantId);
        return {
          path: `items.${s.variantId}`,
          message: V.QTY_INSUFFICIENT,
          variantId: s.variantId,
          name: line?.name,
          available: s.available,
        };
      }),
    );
  }
  const results = [];
  for (const part of allocation) {
    results.push(
      await applyStockOperation(
        {
          type: 'sale',
          branchId: part.branchId,
          lines: part.lines,
          ref: { type: 'order', id: orderId },
          note: '',
        },
        { session },
      ),
    );
  }
  return results;
}

/**
 * Places the cart as an order.
 * @param {{ token?: string | null, customerId?: string | null }} ctx  cart owner (cookie / session)
 * @param {object} input  validated checkout form
 * @param {{ lang: string, idempotencyKey?: string | null }} opts
 */
export async function placeOrder(ctx, input, { lang, idempotencyKey = null }) {
  if (!getSetting('features.guestCheckout') && !ctx.customerId) {
    throw new AppError(ERROR_CODES.FEATURE_DISABLED, 'Guest checkout is disabled', { status: 403 });
  }
  const { cart, view, cookie } = await getCheckoutCart(ctx, lang);
  if (!cart) throw cartEmpty();
  const key = idempotencyKey ? `${ctx.customerId ?? str(cart._id)}:${idempotencyKey}` : null;
  if (key) {
    const existing = await repo.findByIdempotencyKey(key);
    if (existing) return { order: toOrderDto(existing), cookie, replayed: true };
  }

  const items = sellableLines(view);
  const customFields = await validateCustomValues('checkout', input.customFields ?? {});
  // The method the customer picked must still be on offer, and it decides the fee.
  const { method, fee } = await resolveCheckoutMethod(input.paymentMethod, {
    total: buildOrderLines(items).totals.total,
  });
  const { lines, totals, tax } = buildOrderLines(items, fee);
  const token = randomToken(24);

  let outcome;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      outcome = await withTransaction(async (session) => {
        const orderId = new mongoose.Types.ObjectId();
        const stock = await takeStock(lines, str(orderId), session);
        const perBranch = new Map(
          stock.map((r) => [str(r.operation.branchId), r.movements.length]),
        );
        const primary = [...perBranch.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const orderNo = formatSequence(await nextSequence('order', { session }), {
          prefix: ORDER.NUMBER_PREFIX,
          pad: 6,
        });
        const created = await repo.insertOrder(
          {
            _id: orderId,
            orderNo,
            channel: 'online',
            status: 'pending',
            lang,
            customer: {
              customerId: ctx.customerId ? oid(ctx.customerId) : null,
              name: input.contact.name,
              phone: input.contact.phone,
              email: input.contact.email ?? null,
            },
            deliveryMethod: input.deliveryMethod,
            address: cleanAddress(input.address),
            items: lines,
            totals,
            currency: getSetting('store.currency'),
            pricesIncludeVat: tax.pricesIncludeVat,
            payment: {
              method: method.key,
              // Snapshot: a method may be renamed or removed, receipts may not change (§2.5).
              methodType: method.type,
              label: methodLabel(method, lang),
              fee,
              status: 'pending',
            },
            customFields,
            note: input.note ?? '',
            fulfillment: stock.map((r) => ({
              branchId: r.operation.branchId,
              operationId: r.operation._id,
              docNo: r.operation.docNo,
            })),
            branchId: primary ? oid(primary) : null,
            confirmationTokenHash: sha256(token),
            idempotencyKey: key,
            placedAt: new Date(),
          },
          session,
        );
        // The cart must still hold exactly what was ordered.
        const emptied = await emptyCartForOrder(cart._id, cart.rev, session);
        if (!emptied) throw new ConflictError('Cart changed, please review it');
        return { order: created, stock };
      });
      break;
    } catch (err) {
      if (key && isDuplicateKey(err, 'idempotencyKey')) {
        const existing = await repo.findByIdempotencyKey(key);
        if (existing) return { order: toOrderDto(existing), cookie, replayed: true };
      }
      // Someone else took the last unit between allocation and booking: re-allocate once more.
      const retryable = err?.code === ERROR_CODES.INSUFFICIENT_STOCK && attempt < ATTEMPTS - 1;
      if (!retryable) {
        if (err?.code === ERROR_CODES.INSUFFICIENT_STOCK) {
          throw outOfStock(
            (err.details ?? []).map((d) => ({ ...d, path: d.path.replace(/^lines\./, 'items.') })),
          );
        }
        throw err;
      }
    }
  }

  outcome.stock.forEach(publishStockResult);
  void eventBus.emit(EVENTS.ORDER_CREATED, {
    orderId: str(outcome.order._id),
    orderNo: outcome.order.orderNo,
    channel: 'online',
    customerId: str(outcome.order.customer.customerId),
    total: outcome.order.totals.total,
    itemCount: outcome.order.totals.itemCount,
    paymentMethod: outcome.order.payment.method,
    lang,
  });
  // The payment follows the order: a record for cash, a hosted payment page for a card. Failing
  // here must not lose the order — the customer can retry from the confirmation page.
  let payment = null;
  try {
    payment = await paymentHooks.start?.(outcome.order, { token });
  } catch (err) {
    logger.error(
      { err: { message: err.message }, orderNo: outcome.order.orderNo },
      'starting the payment failed',
    );
  }

  return {
    order: toOrderDto(outcome.order, { token, redirectUrl: payment?.redirectUrl ?? null }),
    cookie,
    replayed: false,
  };
}

// ---------------------------------------------------------------- reading an order

/** Confirmation page: the unguessable link token issued at checkout. */
export async function getOrderByToken(token) {
  const found = token ? await repo.findByConfirmationToken(sha256(token)) : null;
  if (!found) throw new NotFoundError('Order not found');
  // The customer may be arriving straight back from the payment page, before its webhook: ask
  // the gateway, then re-read the order the answer may just have changed.
  if (found.payment.status === 'pending' && paymentHooks.sync) {
    await paymentHooks.sync(found);
    return toOrderDto((await repo.findById(found._id)) ?? found);
  }
  return toOrderDto(found);
}

/** The raw order behind a confirmation link — for services that need more than the DTO. */
export const findOrderByConfirmationToken = async (token) =>
  token ? repo.findDocByConfirmationToken(sha256(token)) : null;

/**
 * What the public tracking page shows (P3.6). Anyone holding an order number and the phone on it
 * sees enough to follow the delivery — and no more: no email, no street address, no custom-field
 * answers. The person already knows the phone they typed, so it is not repeated back either.
 */
export const toTrackingDto = (o) => ({
  orderNo: o.orderNo,
  status: o.status,
  placedAt: o.placedAt,
  updatedAt: o.updatedAt ?? o.placedAt,
  customerName: o.customer.name,
  deliveryMethod: o.deliveryMethod,
  /** Enough to recognise the delivery, not enough to find the door. */
  city: o.address?.city ?? null,
  items: o.items.map((i) => ({
    name: i.name,
    options: i.options ?? [],
    image: i.imageUrl ?? null,
    qty: i.qty,
    lineTotal: i.lineTotal,
  })),
  totals: { itemCount: o.totals.itemCount, total: o.totals.total },
  currency: o.currency,
  payment: { method: o.payment.method, label: o.payment.label ?? null, status: o.payment.status },
  /** The parcel, once there is one (P4.3): carrier and tracking, nothing internal. */
  shipment: latestShipment(o),
});

/** Tracking (P3.6): order number + the phone on the order. */
export async function trackOrder({ number, phone }) {
  const order = await repo.findForTracking(number, phone);
  if (!order) throw new NotFoundError('Order not found');
  return toTrackingDto(order);
}

/** For other modules (admin order screens arrive with P4.4). */
export const getOrderById = async (id) => {
  const order = await repo.findById(id);
  return order ? toOrderDto(order) : null;
};

// ------------------------------------------------------- P4.3 the shop's own view of an order

/** Everything the shop needs on one order, including what it may do with it next. */
export const toStaffOrderDto = (o) => ({
  ...toOrderDto(o),
  channel: o.channel,
  branchId: str(o.branchId),
  placedAt: o.placedAt,
  updatedAt: o.updatedAt,
  cancelledAt: o.cancelledAt ?? null,
  cancelReason: o.cancelReason ?? null,
  shipments: (o.shipments ?? []).map((sh) => ({
    carrier: sh.carrier,
    trackingNumber: sh.trackingNumber ?? null,
    trackingUrl: sh.trackingUrl ?? null,
    shippedAt: sh.shippedAt,
  })),
  statusHistory: (o.statusHistory ?? []).map((h) => ({
    at: h.at,
    from: h.from,
    to: h.to,
    action: h.action,
    by: h.by,
    staffId: str(h.staffId),
    reason: h.reason ?? null,
    restocked: Boolean(h.restocked),
  })),
  /** Staff notes, oldest first — internal only (P4.4). */
  notes: (o.notes ?? []).map((n) => ({
    at: n.at,
    staffId: str(n.staffId),
    staffName: n.staffName ?? null,
    text: n.text,
  })),
  /** What the admin may offer right now, and why an action is blocked (P4.4 renders these). */
  nextActions: nextActions(o),
});

/** List row: enough for the orders screen without shipping every snapshot. */
const toStaffRow = (o) => ({
  id: str(o._id),
  orderNo: o.orderNo,
  status: o.status,
  channel: o.channel,
  placedAt: o.placedAt,
  customer: { name: o.customer.name, phone: o.customer.phone },
  itemCount: o.totals.itemCount,
  total: o.totals.total,
  currency: o.currency,
  payment: { method: o.payment.method, status: o.payment.status },
  shipped: Boolean(o.shipments?.length),
});

/** @param {{ page: number, limit: number, sort: object, status?: string, channel?: string, q?: string }} query */
export async function listOrdersForStaff({ page, limit, sort, status, channel, q }) {
  const filter = {
    ...(status && { status }),
    ...(channel && { channel }),
    ...(q && {
      $or: [
        { orderNo: new RegExp(`^${escapeRegExp(normalizeDigits(q).toUpperCase())}`) },
        // Phones are stored normalized (+9665…), so match on the last digits the staff typed —
        // "0512345678", "512345678" and "+966512345678" all find the same customer.
        ...(phoneTail(q) ? [{ 'customer.phone': new RegExp(`${phoneTail(q)}$`) }] : []),
      ],
    }),
  };
  const { items, total } = await repo.listOrders(filter, {
    sort: { [sort.field]: sort.direction },
    skip: (page - 1) * limit,
    limit,
  });
  return { data: items.map(toStaffRow), meta: { page, limit, total } };
}

export async function getOrderForStaff(id) {
  const order = await repo.findById(id);
  if (!order) throw new NotFoundError('Order not found');
  return toStaffOrderDto(order);
}

/** A note the shop leaves itself on an order (never shown to the customer). */
export async function addOrderNote(id, text, actor) {
  const staffId = actor?.staffId ?? null;
  // The name is written WITH the note: who said this is part of the record, and a staff member
  // may be renamed or leave (the stock history resolves names the same way, D-093).
  const names = staffId ? await getStaffNames([staffId]) : new Map();
  const updated = await repo.addNote(id, {
    at: new Date(),
    staffId: staffId ? new mongoose.Types.ObjectId(String(staffId)) : null,
    staffName: names.get(String(staffId))?.name ?? null,
    text,
  });
  if (!updated) throw new NotFoundError('Order not found');
  void eventBus.emit(EVENTS.ORDER_NOTE_ADDED, {
    orderId: str(updated._id),
    orderNo: updated.orderNo,
    staffId: str(actor?.staffId),
  });
  return toStaffOrderDto(updated);
}

/**
 * The products that sold most in the last `days` days, best first. Pages use this for the
 * "best selling" rail; it returns ids only, so the catalogue stays the one place that shapes cards.
 */
export function getBestSellingProductIds({ limit = 8, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return repo.topSellingProductIds({ limit, since });
}
