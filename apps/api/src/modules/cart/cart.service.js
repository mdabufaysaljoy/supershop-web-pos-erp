import { CART, ERROR_CODES, EVENTS, priceLines } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import mongoose from 'mongoose';
import { randomToken, sha256 } from '../../core/crypto.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import { getOnlineOnHand } from '../inventory/index.js';
import { getCartVariants } from '../products/index.js';
import { getSetting } from '../settings/index.js';
import * as repo from './cart.repo.js';

/**
 * Cart service (P3.2). Server-side carts for guests (cookie token) and customers, merged when a
 * guest signs in. Every read REVALIDATES against the catalog: current price, VAT (shared
 * `priceLines`), sellability and online stock. Quantities above what can be sold are reduced
 * and reported once (`notices`); unavailable / out-of-stock lines stay visible but are left out
 * of the totals until the shopper removes them or stock returns.
 *
 * `ctx` = { token?: string (guest cookie), customerId?: string }.
 * Results carry `cookie`: 'set' (with `token`), 'clear', or null — the controller applies it.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => String(id);
const MAX_ATTEMPTS = 10;
/** Jittered pause between optimistic retries so parallel writers spread out. */
const backoff = (attempt) =>
  attempt ? new Promise((r) => setTimeout(r, Math.random() * 10 * attempt)) : null;
const guestExpiry = () => new Date(Date.now() + CART.GUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
const notInCart = () => new NotFoundError('Item is not in the cart');
const outOfStock = () =>
  new AppError(ERROR_CODES.OUT_OF_STOCK, 'Out of stock', {
    status: 409,
    details: [{ path: 'variantId', message: V.QTY_INSUFFICIENT }],
  });
const emit = (cart, payload) =>
  void eventBus.emit(EVENTS.CART_UPDATED, {
    cartId: str(cart._id),
    customerId: cart.customerId ? str(cart.customerId) : null,
    ...payload,
  });

// ---------------------------------------------------------------- loading & merging

/** Sums quantities of the same variant (merge); the newest price seen wins. */
function mergeItems(into, from) {
  const byId = new Map(into.map((i) => [str(i.variantId), { ...i }]));
  for (const i of from) {
    const have = byId.get(str(i.variantId));
    if (have) have.qty = Math.min(CART.MAX_QTY, have.qty + i.qty);
    else byId.set(str(i.variantId), { ...i });
  }
  return [...byId.values()].slice(0, CART.MAX_LINES);
}

/**
 * The cart for this request. A signed-in customer with a guest cookie gets the guest lines
 * merged into their cart (or the guest cart adopted), and the cookie is cleared.
 */
async function loadCart(ctx) {
  const guest = ctx.token ? await repo.findByTokenHash(sha256(ctx.token)) : null;
  if (!ctx.customerId) return { cart: guest, cookie: ctx.token && !guest ? 'clear' : null };

  const customerId = oid(ctx.customerId);
  let own = await repo.findByCustomer(customerId);
  if (!guest) return { cart: own, cookie: ctx.token ? 'clear' : null };

  if (!own) {
    try {
      own = await repo.attachToCustomer(guest._id, customerId);
    } catch (err) {
      if (!isDuplicateKey(err, 'customerId')) throw err;
      own = null; // another request created the customer's cart meanwhile → merge below
    }
    if (own) {
      emit(own, { action: 'merge', lines: own.items.length });
      return { cart: own, cookie: 'clear' };
    }
    own = await repo.findByCustomer(customerId);
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS && own; attempt += 1) {
    await backoff(attempt);
    const merged = await repo.replaceItems(own._id, own.rev, mergeItems(own.items, guest.items));
    if (merged) {
      await repo.deleteById(guest._id);
      emit(merged, { action: 'merge', lines: guest.items.length });
      return { cart: merged, cookie: 'clear' };
    }
    own = await repo.findByCustomer(customerId);
  }
  throw new ConflictError('Cart changed, please retry');
}

/** New empty cart for this request (guest → fresh token for the cookie). */
async function createCart(ctx) {
  if (ctx.customerId) {
    try {
      return { cart: await repo.createCart({ customerId: oid(ctx.customerId) }), cookie: null };
    } catch (err) {
      if (isDuplicateKey(err, 'customerId')) return null; // created concurrently → retry
      throw err;
    }
  }
  const token = randomToken(32);
  const cart = await repo.createCart({ tokenHash: sha256(token), expiresAt: guestExpiry() });
  return { cart, cookie: 'set', token };
}

/**
 * Read-modify-write with optimistic concurrency. `change(items)` returns the new line set (or
 * throws). Retries when another request changed the cart in between.
 */
async function mutate(requestCtx, change, { create = true } = {}) {
  let ctx = requestCtx;
  let cookieOut = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await backoff(attempt);
    const loaded = await loadCart(ctx);
    let { cart } = loaded;
    if (loaded.cookie) cookieOut = { cookie: loaded.cookie };
    if (!cart) {
      if (!create) return { cart: null, ...cookieOut };
      const made = await createCart(ctx);
      if (!made) continue;
      ({ cart } = made);
      if (made.cookie === 'set') {
        cookieOut = { cookie: 'set', token: made.token };
        // Later attempts must find this cart, not create another.
        ctx = { ...ctx, token: made.token };
      }
    }
    const items = change(
      cart.items.map((i) => ({ ...i })),
      cart,
    );
    const updated = await repo.replaceItems(cart._id, cart.rev, items, {
      expiresAt: cart.customerId ? null : guestExpiry(),
    });
    if (updated) return { cart: updated, ...cookieOut };
  }
  throw new ConflictError('Cart changed, please retry');
}

// ---------------------------------------------------------------- view (revalidation)

const maxLineQty = () => getSetting('cart.maxLineQty');

/**
 * Current view of a cart: lines priced from the catalog, stock-checked, totals with VAT.
 * Applies (and persists) corrections: quantities capped to what can be sold, prices re-seen.
 * @param {object | null} cart
 * @param {string} lang
 * @param {Map<string, object[]>} [extraNotices]  notices produced by the current change
 */
async function buildView(cart, lang, extraNotices = new Map()) {
  const items = cart?.items ?? [];
  const ids = items.map((i) => str(i.variantId));
  const [variants, onHand] = await Promise.all([getCartVariants(ids, lang), getOnlineOnHand(ids)]);
  const settingMax = maxLineQty();
  let changed = false;

  const lines = items.map((item) => {
    const id = str(item.variantId);
    const v = variants.get(id);
    const available = onHand.get(id) ?? 0;
    const status = !v?.sellable ? 'unavailable' : available <= 0 ? 'out_of_stock' : 'ok';
    const notices = [...(extraNotices.get(id) ?? [])];
    const maxQty = status === 'ok' ? Math.min(settingMax, available) : 0;
    let qty = item.qty;
    if (status === 'ok' && qty > maxQty) {
      notices.push({ code: 'qty_reduced', from: qty, to: maxQty });
      qty = maxQty;
      changed = true;
    }
    if (
      v &&
      status !== 'unavailable' &&
      item.unitPriceSeen != null &&
      v.price !== item.unitPriceSeen
    ) {
      notices.push({ code: 'price_changed', from: item.unitPriceSeen, to: v.price });
      changed = true;
    }
    return {
      item: { ...item, qty, unitPriceSeen: v?.price ?? item.unitPriceSeen },
      v,
      status,
      maxQty,
      notices,
    };
  });

  const tax = {
    vatRateBps: getSetting('tax.vatRateBps'),
    pricesIncludeVat: getSetting('tax.pricesIncludeVat'),
  };
  const sellable = lines.filter((l) => l.status === 'ok');
  const priced = priceLines(
    sellable.map((l) => ({ unitPrice: l.v.price, qty: l.item.qty, taxCategory: l.v.taxCategory })),
    tax,
  );
  const lineTotals = new Map(sellable.map((l, i) => [l, priced.lines[i]]));

  if (changed && cart) {
    // Best effort: a concurrent change wins and is revalidated on its own read.
    await repo.replaceItems(
      cart._id,
      cart.rev,
      lines.map((l) => l.item),
    );
  }

  return {
    items: lines.map((l) => ({
      variantId: str(l.item.variantId),
      productId: str(l.item.productId),
      slug: l.v?.slug ?? null,
      name: l.v?.name ?? '',
      options: l.v?.options ?? [],
      sku: l.v?.sku ?? null,
      image: l.v?.image ?? null,
      unitPrice: l.v?.price ?? l.item.unitPriceSeen ?? 0,
      compareAtPrice: l.v?.compareAtPrice ?? null,
      /** VAT treatment of the product (checkout prices the order from this view). */
      taxCategory: l.v?.taxCategory ?? 'standard',
      qty: l.item.qty,
      maxQty: l.maxQty,
      lineTotal: lineTotals.get(l)?.lineTotal ?? null,
      status: l.status,
      notices: l.notices,
    })),
    totals: priced.totals,
    currency: getSetting('store.currency'),
    pricesIncludeVat: tax.pricesIncludeVat,
    vatRateBps: tax.vatRateBps,
    updatedAt: cart?.updatedAt ?? null,
  };
}

// ---------------------------------------------------------------- public API

/** GET: the current cart (an empty view when there is none; nothing is created). */
export async function getCart(ctx, lang) {
  const { cart, cookie } = await loadCart(ctx);
  return { view: await buildView(cart, lang), cookie };
}

/**
 * Checkout (orders module): the cart with its revalidated view, or `null` when there is none.
 * `rev` is the revision the order must still see when it empties the cart.
 */
export async function getCheckoutCart(ctx, lang) {
  const { cart, cookie } = await loadCart(ctx);
  if (!cart) return { cart: null, view: await buildView(null, lang), cookie };
  const view = await buildView(cart, lang);
  // buildView may have corrected the cart (price/stock), so read the current revision back.
  const current = (await repo.findById(cart._id)) ?? cart;
  return { cart: current, view, cookie };
}

/** Empties a cart inside the order transaction; `null` when it changed meanwhile. */
export const emptyCartForOrder = (cartId, rev, session) =>
  repo.replaceItems(cartId, rev, [], {}, session);

/** Adds `qty` of a variant (to what is already in the cart), capped to what can be sold. */
export async function addItem(ctx, { variantId, qty }, lang) {
  const [variants, onHand] = await Promise.all([
    getCartVariants([variantId], lang),
    getOnlineOnHand([variantId]),
  ]);
  const v = variants.get(variantId);
  if (!v?.sellable) throw new NotFoundError('Product not available');
  const available = onHand.get(variantId) ?? 0;
  if (available <= 0) throw outOfStock();
  const max = Math.min(maxLineQty(), available);
  const notices = new Map();
  let previousQty = 0;

  const result = await mutate(ctx, (items) => {
    const line = items.find((i) => str(i.variantId) === variantId);
    previousQty = line?.qty ?? 0;
    if (!line && items.length >= CART.MAX_LINES)
      throw new ValidationError([{ path: 'variantId', message: V.TOO_LONG }]);
    const wanted = previousQty + qty;
    const next = Math.min(wanted, max);
    notices.set(variantId, next < wanted ? [{ code: 'qty_reduced', from: wanted, to: next }] : []);
    if (line) Object.assign(line, { qty: next, unitPriceSeen: v.price });
    else
      items.push({
        variantId: oid(variantId),
        productId: oid(v.productId),
        qty: next,
        unitPriceSeen: v.price,
        addedAt: new Date(),
      });
    return items;
  });
  emit(result.cart, {
    action: 'add',
    variantId,
    qty: Math.min(previousQty + qty, max),
    previousQty,
  });
  return { ...result, view: await buildView(result.cart, lang, notices) };
}

/** Sets a line's quantity (0 removes it). Increases are capped to what can be sold. */
export async function setItemQty(ctx, variantId, qty, lang) {
  if (qty === 0) return removeItem(ctx, variantId, lang);
  const onHand = await getOnlineOnHand([variantId]);
  const max = Math.min(maxLineQty(), onHand.get(variantId) ?? 0);
  const notices = new Map();
  let previousQty = 0;

  const result = await mutate(
    ctx,
    (items) => {
      const line = items.find((i) => str(i.variantId) === variantId);
      if (!line) throw notInCart();
      previousQty = line.qty;
      // Out of stock: only reductions are allowed (the line stays flagged).
      const next = max > 0 ? Math.min(qty, max) : Math.min(qty, line.qty);
      if (next < qty) notices.set(variantId, [{ code: 'qty_reduced', from: qty, to: next }]);
      line.qty = next;
      return items;
    },
    { create: false },
  );
  if (!result.cart) throw notInCart();
  emit(result.cart, {
    action: 'set',
    variantId,
    qty: result.cart.items.find((i) => str(i.variantId) === variantId)?.qty,
    previousQty,
  });
  return { ...result, view: await buildView(result.cart, lang, notices) };
}

export async function removeItem(ctx, variantId, lang) {
  let previousQty = 0;
  const result = await mutate(
    ctx,
    (items) => {
      const line = items.find((i) => str(i.variantId) === variantId);
      if (!line) throw notInCart();
      previousQty = line.qty;
      return items.filter((i) => i !== line);
    },
    { create: false },
  );
  if (!result.cart) throw notInCart();
  emit(result.cart, { action: 'remove', variantId, qty: 0, previousQty });
  return { ...result, view: await buildView(result.cart, lang) };
}

export async function clearCart(ctx, lang) {
  const result = await mutate(ctx, () => [], { create: false });
  if (result.cart) emit(result.cart, { action: 'clear' });
  return { ...result, view: await buildView(result.cart, lang) };
}
