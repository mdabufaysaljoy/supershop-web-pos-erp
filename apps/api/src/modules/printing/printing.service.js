import crypto from 'node:crypto';
import {
  DEFAULT_RECEIPT_TEMPLATE,
  EVENTS,
  receiptData,
  renderTemplate,
  toBase64,
} from '@supershop/shared';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { getSecretSetting, getSetting } from '../settings/index.js';
import * as repo from './printing.repo.js';

/**
 * Printing (P6.3). The printers themselves are on the cashier's machine, reached through QZ Tray
 * in the browser; this module owns the three things a browser must not: the private key that
 * signs QZ's calls, which printers the shop has, and what a receipt actually says.
 *
 * The key never leaves the server — the browser sends the message QZ wants signed and gets back a
 * signature, so a page with no session (or no permission) cannot drive the shop's printers.
 */
const str = (id) => (id == null ? null : String(id));

/**
 * What printing needs from elsewhere: the order to print, and how the shop names itself on paper.
 * Injected at the composition root, so this module imports no other module.
 */
let providers = { getOrder: null, getShop: null };
export function setPrintingProviders(next) {
  providers = { ...providers, ...next };
}

export const toProfileDto = (p) => ({
  id: str(p._id),
  name: p.name,
  printer: p.printer,
  kind: p.kind,
  widthMm: p.widthMm,
  branchId: str(p.branchId),
  cut: p.cut,
  openDrawer: p.openDrawer,
  isDefault: p.isDefault,
  updatedAt: p.updatedAt,
});

// ---------------------------------------------------------------- QZ Tray

/** The certificate QZ shows the browser. Public by design — it proves nothing on its own. */
export function getCertificate() {
  const certificate = getSetting('printing.qzCertificate');
  if (!certificate) throw new ServiceUnavailableError('Printing is not set up');
  return certificate;
}

/**
 * Signs one QZ call with the shop's private key (RSA-SHA512, what QZ's own tooling expects).
 * The caller is an authenticated member of staff with a reason to print; the key is read fresh
 * from settings each time so rotating it takes effect at once, and it is never logged.
 */
export function signForQz(data) {
  const key = getSecretSetting('printing.qzPrivateKey');
  if (!key) throw new ServiceUnavailableError('Printing is not set up');
  try {
    return crypto.createSign('RSA-SHA512').update(String(data)).sign(key, 'base64');
  } catch {
    // A malformed key is a setup mistake, not a request problem — and its message stays here.
    throw new ServiceUnavailableError('The printing key cannot be used');
  }
}

/** Whether the admin should even try to connect to QZ Tray. */
export const printingStatus = () => ({
  enabled: getSetting('printing.enabled'),
  autoPrintReceipt: getSetting('printing.autoPrintReceipt'),
  configured: Boolean(
    getSetting('printing.qzCertificate') && getSecretSetting('printing.qzPrivateKey'),
  ),
});

// ---------------------------------------------------------------- profiles

export const listProfiles = async (filter = {}) =>
  (await repo.list(clean(filter))).map(toProfileDto);

const clean = (filter) =>
  Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined));

export async function getProfile(id) {
  const profile = await repo.findById(id);
  if (!profile) throw new NotFoundError('Printer not found');
  return toProfileDto(profile);
}

export async function createProfile(actor, input) {
  const created = await repo.create({ ...input, updatedBy: actor.staffId });
  if (created.isDefault) await repo.clearDefault(created.kind, created.branchId, created._id);
  emit(created, actor);
  return toProfileDto(created);
}

export async function updateProfile(actor, id, patch) {
  const updated = await repo.update(id, { ...patch, updatedBy: actor.staffId });
  if (!updated) throw new NotFoundError('Printer not found');
  if (updated.isDefault) await repo.clearDefault(updated.kind, updated.branchId, updated._id);
  emit(updated, actor);
  return toProfileDto(updated);
}

export async function deleteProfile(actor, id) {
  const removed = await repo.remove(id);
  if (!removed) throw new NotFoundError('Printer not found');
  emit(removed, actor);
}

const emit = (profile, actor) =>
  void eventBus.emit(EVENTS.PRINTER_PROFILE_UPDATED, {
    profileId: str(profile._id),
    printer: profile.printer,
    kind: profile.kind,
    actorId: actor?.staffId ?? null,
  });

// ---------------------------------------------------------------- jobs

/** Where an order should print: what the till asked for, else the branch's default. */
async function profileFor(kind, { profileId, branchId }) {
  const profile = profileId
    ? await repo.findById(profileId)
    : await repo.findDefault(kind, branchId);
  if (!profile) throw new ConflictError('No printer is set up for this branch');
  return profile;
}

/**
 * A receipt as a print job: the bytes, and which printer they go to. The browser hands this
 * straight to QZ Tray — it never decides what a receipt says.
 *
 * @param {object} order  the order/sale DTO
 * @param {{ profileId?: string, shop: object, lang?: string }} ctx
 */
export async function buildReceiptJob(order, { profileId, shop, lang = 'en' } = {}) {
  const profile = await profileFor('receipt', { profileId, branchId: order.branchId });
  const data = receiptData(order, {
    shop,
    currency: getSetting('store.currency'),
    lang,
    timeZone: getSetting('store.timeZone'),
  });
  const template = [
    ...DEFAULT_RECEIPT_TEMPLATE.filter((block) => block.type !== 'cut' || profile.cut),
    ...(profile.openDrawer ? [{ type: 'drawer' }] : []),
  ];
  return {
    printer: profile.printer,
    profileId: str(profile._id),
    widthMm: profile.widthMm,
    /** QZ Tray takes raw bytes as base64 (`{ type: 'raw', format: 'base64' }`). */
    data: toBase64(renderTemplate(template, data, { widthMm: profile.widthMm })),
  };
}

/**
 * The receipt for an order the shop already has: looked up, checked against the staff member's
 * branches, and rendered for the printer it belongs on.
 */
export async function receiptJobForOrder(actor, orderId, { profileId, lang = 'en' } = {}) {
  const order = await providers.getOrder?.(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.branchId) actor.assertBranch(order.branchId);
  const shop = (await providers.getShop?.(lang)) ?? {};
  return buildReceiptJob(order, { profileId, shop, lang });
}
