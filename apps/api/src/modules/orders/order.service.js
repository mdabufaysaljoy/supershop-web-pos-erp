import {
  deliveryCharge,
  ERROR_CODES,
  EVENTS,
  ORDER,
  orderTotals,
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
import { isDuplicateKey } from '../../core/slug.js';
import { emptyCartForOrder, getCheckoutCart } from '../cart/index.js';
import { validateCustomValues } from '../customFields/index.js';
import {
  applyStockOperation,
  getOnlineStockByBranch,
  publishStockResult,
} from '../inventory/index.js';
import { getSetting } from '../settings/index.js';
import * as repo from './order.repo.js';
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

// ---------------------------------------------------------------- order view

/** What the storefront shows after checkout (and on the confirmation page). */
export const toOrderDto = (o, { token } = {}) => ({
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
  payment: { method: o.payment.method, status: o.payment.status },
  customFields: o.customFields ?? {},
  note: o.note ?? '',
  ...(token && { confirmationToken: token }),
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
function buildOrderLines(items) {
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
  return { lines, totals: orderTotals(priced.totals, delivery), tax };
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
  const { lines, totals, tax } = buildOrderLines(items);
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
            payment: { method: input.paymentMethod, status: 'pending' },
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
  return { order: toOrderDto(outcome.order, { token }), cookie, replayed: false };
}

// ---------------------------------------------------------------- reading an order

/** Confirmation page: the unguessable link token issued at checkout. */
export async function getOrderByToken(token) {
  const order = token ? await repo.findByConfirmationToken(sha256(token)) : null;
  if (!order) throw new NotFoundError('Order not found');
  return toOrderDto(order);
}

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
  payment: { method: o.payment.method, status: o.payment.status },
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
