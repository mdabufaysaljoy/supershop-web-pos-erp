import { EVENTS, paymentFee, SOURCE_LANGUAGE } from '@supershop/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { resolveDoc } from '../i18n/index.js';
import * as repo from './paymentMethod.repo.js';

/**
 * Payment methods (P4.2). The checkout list is DATA: a shop enables, renames, reorders, prices or
 * adds methods without a deploy. Only `type` carries behaviour, and only three exist (gateway,
 * cash on delivery, offline) — anything else a shop invents is an offline method with its own
 * instructions.
 */
const LOCALIZED = ['label', 'instructions'];

/** Seeded once, so a fresh shop has something to sell with. Labels are English source (§5.7). */
const BUILT_INS = [
  {
    key: 'cod',
    type: 'cod',
    label: 'Cash payment on delivery',
    instructions: 'Pay the courier when your order arrives.',
    position: 0,
    builtIn: true,
    enabled: true,
  },
  {
    key: 'card',
    type: 'gateway',
    label: 'Card, Mada or Apple Pay',
    instructions: 'You will be taken to a secure payment page.',
    position: 1,
    builtIn: true,
    // A gateway method stays off until its keys are in Settings → Payments (P4.1).
    enabled: false,
  },
];

/** Creates the built-in methods the first time the shop starts. Safe to call repeatedly. */
export async function seedPaymentMethods() {
  if (await repo.countAll()) return;
  for (const method of BUILT_INS) {
    await repo.insert({
      ...method,
      label: { [SOURCE_LANGUAGE]: method.label },
      instructions: { [SOURCE_LANGUAGE]: method.instructions },
    });
  }
}

export const toAdminDto = (m) => ({
  id: String(m._id),
  key: m.key,
  type: m.type,
  label: m.label,
  instructions: m.instructions,
  enabled: m.enabled,
  position: m.position,
  fee: { fixed: m.fee?.fixed ?? 0, bps: m.fee?.bps ?? 0 },
  iconId: m.iconId ? String(m.iconId) : null,
  minTotal: m.minTotal ?? null,
  maxTotal: m.maxTotal ?? null,
  builtIn: m.builtIn,
});

/** What the storefront shows: resolved strings, no internals. */
export const toPublicDto = (m, lang) => {
  const resolved = resolveDoc(m, LOCALIZED, lang);
  return {
    key: m.key,
    type: m.type,
    label: resolved.label,
    instructions: resolved.instructions || null,
    fee: { fixed: m.fee?.fixed ?? 0, bps: m.fee?.bps ?? 0 },
    iconId: m.iconId ? String(m.iconId) : null,
  };
};

export const listMethods = async () => (await repo.listAll()).map(toAdminDto);

/**
 * Methods a customer may choose for THIS basket: enabled, within their limits, and — for the
 * gateway — actually configured. `isGatewayReady` is injected so this module never reads payment
 * settings itself.
 * @param {{ total?: number, isGatewayReady?: () => boolean, lang?: string }} [opts]
 */
export async function availableMethods({ total = null, isGatewayReady = () => false, lang } = {}) {
  const methods = await repo.listEnabled();
  return methods
    .filter((m) => (m.type === 'gateway' ? isGatewayReady() : true))
    .filter((m) => total == null || m.minTotal == null || total >= m.minTotal)
    .filter((m) => total == null || m.maxTotal == null || total <= m.maxTotal)
    .map((m) => toPublicDto(m, lang));
}

/**
 * The method behind a checkout choice, with the fee it adds. Throws if the key is unknown,
 * disabled or out of range for this basket — the storefront list and the order agree.
 * @param {string} key
 * @param {{ total: number, isGatewayReady?: () => boolean }} ctx
 */
export async function resolveForCheckout(key, { total, isGatewayReady = () => false }) {
  const method = await repo.findByKey(key);
  const usable =
    method?.enabled &&
    (method.type !== 'gateway' || isGatewayReady()) &&
    (method.minTotal == null || total >= method.minTotal) &&
    (method.maxTotal == null || total <= method.maxTotal);
  if (!usable)
    throw new ValidationError(
      [{ path: 'paymentMethod', message: 'validation.invalidType', code: 'invalid_value' }],
      'That payment method is not available',
    );
  return { method, fee: paymentFee(method.fee, total) };
}

export async function getMethod(id) {
  const method = await repo.findById(id);
  if (!method) throw new NotFoundError('Payment method not found');
  return toAdminDto(method);
}

const emit = (name, method, ctx) =>
  void eventBus.emit(
    name,
    { paymentMethodId: String(method._id), key: method.key, enabled: method.enabled },
    { requestId: ctx?.requestId },
  );

export async function createMethod(input, ctx = {}) {
  if (await repo.findByKey(input.key))
    throw new ConflictError('A payment method with this key already exists', { fields: ['key'] });
  const position = (await repo.countAll()) + 1;
  const created = await repo.insert({
    key: input.key,
    type: 'offline',
    label: { [SOURCE_LANGUAGE]: input.label },
    instructions: { [SOURCE_LANGUAGE]: input.instructions ?? '' },
    enabled: input.enabled ?? true,
    position,
    fee: { fixed: input.fee?.fixed ?? 0, bps: input.fee?.bps ?? 0 },
    iconId: input.iconId ?? null,
    minTotal: input.minTotal ?? null,
    maxTotal: input.maxTotal ?? null,
    builtIn: false,
  });
  emit(EVENTS.PAYMENT_METHOD_CREATED, created, ctx);
  return toAdminDto(created);
}

export async function updateMethod(id, patch, ctx = {}) {
  const updated = await repo.updateDoc(id, (doc) => {
    // Only the English source is written; Arabic follows from the translation hooks (§5.7).
    if (patch.label !== undefined) doc.set(`label.${SOURCE_LANGUAGE}`, patch.label);
    if (patch.instructions !== undefined)
      doc.set(`instructions.${SOURCE_LANGUAGE}`, patch.instructions);
    if (patch.enabled !== undefined) doc.enabled = patch.enabled;
    if (patch.fee !== undefined) doc.fee = { fixed: patch.fee.fixed ?? 0, bps: patch.fee.bps ?? 0 };
    if (patch.iconId !== undefined) doc.iconId = patch.iconId;
    if (patch.minTotal !== undefined) doc.minTotal = patch.minTotal;
    if (patch.maxTotal !== undefined) doc.maxTotal = patch.maxTotal;
  });
  if (!updated) throw new NotFoundError('Payment method not found');
  emit(EVENTS.PAYMENT_METHOD_UPDATED, updated, ctx);
  return toAdminDto(updated);
}

/** Built-in methods stay: checkout knows how to finish them, and old orders name them. */
export async function removeMethod(id, ctx = {}) {
  const method = await repo.findById(id);
  if (!method) throw new NotFoundError('Payment method not found');
  if (method.builtIn)
    throw new ConflictError('This payment method cannot be deleted, only switched off');
  await repo.remove(id);
  emit(EVENTS.PAYMENT_METHOD_DELETED, method, ctx);
}

/** The admin drags the list; the whole order arrives at once. */
export async function reorderMethods(ids, ctx = {}) {
  const known = await repo.listAll();
  if (ids.length !== known.length || new Set(ids).size !== ids.length)
    throw new ValidationError(
      [{ path: 'ids', message: 'validation.invalidType', code: 'invalid_value' }],
      'Send every payment method exactly once',
    );
  const byId = new Set(known.map((m) => String(m._id)));
  if (ids.some((id) => !byId.has(id))) throw new NotFoundError('Payment method not found');
  await repo.setPositions(ids);
  void eventBus.emit(
    EVENTS.PAYMENT_METHOD_UPDATED,
    { reordered: ids.length },
    {
      requestId: ctx.requestId,
    },
  );
  return listMethods();
}
