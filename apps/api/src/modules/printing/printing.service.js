import crypto from 'node:crypto';
import {
  buildLabelTemplate,
  buildReceiptTemplate,
  buildReturnReceiptTemplate,
  buildShiftReportTemplate,
  charsForWidth,
  DEFAULT_LABEL_CONFIG,
  DEFAULT_RECEIPT_CONFIG,
  EVENTS,
  labelData,
  previewLines,
  receiptData,
  receiptUrl,
  renderEscPos,
  renderTemplate,
  returnReceiptData,
  shiftReportData,
  toBase64,
  zatcaQr,
} from '@supershop/shared';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { config } from '../../core/config.js';
import { getSecretSetting, getSetting } from '../settings/index.js';
import * as repo from './printing.repo.js';

/**
 * Printing (P6.3, P6.4). The printers themselves are on the cashier's machine, reached through QZ
 * Tray in the browser; this module owns the things a browser must not: the private key that signs
 * QZ's calls, which printers the shop has, and what a receipt or barcode label actually says.
 *
 * The key never leaves the server — the browser sends the message QZ wants signed and gets back a
 * signature, so a page with no session (or no permission) cannot drive the shop's printers.
 */
const str = (id) => (id == null ? null : String(id));

/**
 * What printing needs from elsewhere: the order to print, how the shop names itself on paper,
 * media URLs for the receipt logo, and variant lookup for barcode labels. Injected at the
 * composition root, so this module imports no other module.
 */
let providers = { getOrder: null, getShop: null, getMediaByIds: null, getVariant: null };
export function setPrintingProviders(next) {
  providers = { ...providers, ...next };
}

async function resolveShop(lang = 'en') {
  const resolved = (await providers.getShop?.(lang)) ?? {};
  return {
    name: resolved.name || getSetting('store.name'),
    address: resolved.address ?? '',
    phone: resolved.phone ?? '',
    vatNumber: resolved.vatNumber ?? getSetting('tax.vatNumber') ?? '',
  };
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

// ---------------------------------------------------------------- templates (P6.4)

const SAMPLE_SALE = Object.freeze({
  orderNo: 'POS-000042',
  placedAt: '2026-10-14T14:30:00.000Z',
  cashierName: 'Sarah',
  branchName: 'Main store',
  totals: {
    itemCount: 2,
    subtotal: 23_000,
    discountTotal: 1500,
    net: 18_696,
    vat: 2804,
    total: 21_500,
  },
  items: [
    {
      name: 'Oxford Shirt',
      sku: 'OX-RED-L',
      qty: 2,
      unitPrice: 11_500,
      discountTotal: 1500,
      lineTotal: 21_500,
    },
  ],
  payments: [{ label: 'Cash', amount: 25_000 }],
  changeGiven: 3500,
  customer: { customerId: 'sample', name: 'walk-in' },
});

const SAMPLE_LABEL = Object.freeze({
  name: 'Oxford Shirt',
  variant: 'Red / L',
  sku: 'OX-RED-L',
  barcode: '6281000000014',
  price: 11_500,
});

const toEn = (v) => (typeof v === 'string' ? v : (v?.en ?? ''));
const applyLocalized = (current, next) => ({
  ...(current?.toObject?.() ?? current ?? {}),
  en: toEn(next),
});

async function resolveLogo(logoMediaId) {
  if (!logoMediaId || !providers.getMediaByIds) return null;
  const map = await providers.getMediaByIds([String(logoMediaId)]);
  const media = map instanceof Map ? map.get(String(logoMediaId)) : map?.[String(logoMediaId)];
  return media ? { id: String(logoMediaId), url: media.url, alt: media.alt ?? '' } : null;
}

async function toReceiptTemplateDto(doc) {
  const lang = doc.lang ?? DEFAULT_RECEIPT_CONFIG.lang;
  const widthMm = doc.widthMm ?? DEFAULT_RECEIPT_CONFIG.widthMm;
  const fields = { ...DEFAULT_RECEIPT_CONFIG.fields, ...doc.fields };
  const labels = Object.fromEntries(
    Object.keys(DEFAULT_RECEIPT_CONFIG.labels).map((k) => [
      k,
      doc.labels?.[k] ?? DEFAULT_RECEIPT_CONFIG.labels[k],
    ]),
  );
  const shop = await resolveShop(lang === 'ar' ? 'ar' : 'en');
  const previewShop = {
    ...shop,
    address: shop.address || 'Riyadh',
    phone: shop.phone || '+966500000000',
    vatNumber: shop.vatNumber || '300000000000003',
  };
  const qr = fields.showQr
    ? zatcaQr({
        sellerName: previewShop.name,
        vatNumber: previewShop.vatNumber,
        timestamp: SAMPLE_SALE.placedAt,
        total: SAMPLE_SALE.totals.total,
        vat: SAMPLE_SALE.totals.vat,
      })
    : '';
  const storefrontBase = (
    config.STOREFRONT_URL ||
    getSetting('store.url') ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  const onlineReceiptUrl = receiptUrl(storefrontBase, SAMPLE_SALE.orderNo, lang);
  const data = receiptData(
    { ...SAMPLE_SALE, zatcaQr: qr, onlineReceiptUrl },
    {
      shop: previewShop,
      currency: getSetting('store.currency'),
      lang: lang === 'ar' ? 'ar' : 'en',
      timeZone: getSetting('store.timeZone'),
      storefrontUrl: storefrontBase,
    },
  );
  const compiled = buildReceiptTemplate({ ...doc, lang, widthMm, fields, labels }, { lang });
  const bytes = renderTemplate(compiled, data, { widthMm });
  const logo = await resolveLogo(doc.logoMediaId);

  return {
    lang,
    widthMm,
    logoMediaId: str(doc.logoMediaId),
    logo,
    headerText: doc.headerText ?? DEFAULT_RECEIPT_CONFIG.headerText,
    footerText: doc.footerText ?? DEFAULT_RECEIPT_CONFIG.footerText,
    fields,
    labels,
    updatedAt: doc.updatedAt,
    preview: {
      widthMm,
      charsPerLine: charsForWidth(widthMm),
      lines: previewLines(bytes),
      qr,
      onlineReceiptUrl,
      hasShopVatNumber: Boolean(shop.vatNumber),
    },
  };
}

async function toLabelTemplateDto(doc) {
  const widthMm = doc.widthMm ?? DEFAULT_LABEL_CONFIG.widthMm;
  const heightMm = doc.heightMm ?? DEFAULT_LABEL_CONFIG.heightMm;
  const barcodeHeight = doc.barcodeHeight ?? DEFAULT_LABEL_CONFIG.barcodeHeight;
  const fields = { ...DEFAULT_LABEL_CONFIG.fields, ...doc.fields };
  const shop = await resolveShop('en');
  const sample = labelData(SAMPLE_LABEL, {
    shop,
    currency: getSetting('store.currency'),
  });
  const compiled = buildLabelTemplate({ widthMm, heightMm, barcodeHeight, fields });
  const bytes = renderTemplate(compiled, sample, { widthMm });

  return {
    widthMm,
    heightMm,
    barcodeHeight,
    fields,
    updatedAt: doc.updatedAt,
    preview: {
      widthMm,
      heightMm,
      lines: previewLines(bytes),
      sample,
    },
  };
}

export async function getTemplates() {
  const [receipt, label] = await Promise.all([repo.getReceiptTemplate(), repo.getLabelTemplate()]);
  const [receiptDto, labelDto] = await Promise.all([
    toReceiptTemplateDto(receipt),
    toLabelTemplateDto(label),
  ]);
  return { receipt: receiptDto, label: labelDto };
}

export async function updateReceiptTemplate(actor, patch) {
  const updated = await repo.updateReceiptTemplate((doc) => {
    if (patch.lang !== undefined) doc.lang = patch.lang;
    if (patch.widthMm !== undefined) doc.widthMm = patch.widthMm;
    if (patch.logoMediaId !== undefined) doc.logoMediaId = patch.logoMediaId;
    if (patch.headerText !== undefined) {
      doc.headerText = applyLocalized(doc.headerText, patch.headerText);
    }
    if (patch.footerText !== undefined) {
      doc.footerText = applyLocalized(doc.footerText, patch.footerText);
    }
    for (const [k, v] of Object.entries(patch.fields ?? {})) {
      doc.fields[k] = v;
    }
    for (const [k, v] of Object.entries(patch.labels ?? {})) {
      doc.labels[k] = applyLocalized(doc.labels?.[k], v);
    }
    doc.updatedBy = actor?.staffId ?? null;
  });
  void eventBus.emit(EVENTS.RECEIPT_TEMPLATE_UPDATED, {
    actorId: actor?.staffId ?? null,
    lang: updated.lang,
    widthMm: updated.widthMm,
  });
  return toReceiptTemplateDto(updated);
}

export async function updateLabelTemplate(actor, patch) {
  const updated = await repo.updateLabelTemplate((doc) => {
    if (patch.widthMm !== undefined) doc.widthMm = patch.widthMm;
    if (patch.heightMm !== undefined) doc.heightMm = patch.heightMm;
    if (patch.barcodeHeight !== undefined) doc.barcodeHeight = patch.barcodeHeight;
    for (const [k, v] of Object.entries(patch.fields ?? {})) {
      doc.fields[k] = v;
    }
    doc.updatedBy = actor?.staffId ?? null;
  });
  void eventBus.emit(EVENTS.LABEL_TEMPLATE_UPDATED, {
    actorId: actor?.staffId ?? null,
    widthMm: updated.widthMm,
    heightMm: updated.heightMm,
  });
  return toLabelTemplateDto(updated);
}

// ---------------------------------------------------------------- jobs

/** Where an order should print: what the till asked for, else the branch's default. */
async function profileFor(kind, { profileId, branchId }) {
  let profile = profileId ? await repo.findById(profileId) : await repo.findDefault(kind, branchId);
  if (!profile && kind === 'label') {
    profile = await repo.findDefault('receipt', branchId);
  }
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
export async function buildReceiptJob(order, { profileId, shop = {}, lang = 'en' } = {}) {
  const [profile, saved] = await Promise.all([
    profileFor('receipt', { profileId, branchId: order.branchId }),
    repo.getReceiptTemplate(),
  ]);
  const tplLang = saved.lang ?? lang;
  const fields = { ...DEFAULT_RECEIPT_CONFIG.fields, ...saved.fields };
  const storefrontBase = (
    config.STOREFRONT_URL ||
    getSetting('store.url') ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  const onlineReceiptUrl =
    order.onlineReceiptUrl || receiptUrl(storefrontBase, order.orderNo, tplLang);
  const qr =
    order.zatcaQr ||
    (fields.showQr
      ? zatcaQr({
          sellerName: shop.name,
          vatNumber: shop.vatNumber,
          timestamp: order.placedAt ?? order.createdAt,
          total: order.totals?.total,
          vat: order.totals?.vat,
        })
      : '');
  const data = receiptData(
    { ...order, zatcaQr: qr, onlineReceiptUrl },
    {
      shop,
      currency: getSetting('store.currency'),
      lang: tplLang === 'ar' ? 'ar' : 'en',
      timeZone: getSetting('store.timeZone'),
      storefrontUrl: storefrontBase,
    },
  );
  const compiled = buildReceiptTemplate(saved, { lang: tplLang });
  const template = [
    ...compiled.filter((block) => block.type !== 'cut' || profile.cut),
    ...(profile.openDrawer ? [{ type: 'drawer' }] : []),
  ];
  return {
    printer: profile.printer,
    profileId: str(profile._id),
    widthMm: profile.widthMm,
    lang: tplLang,
    qr: qr || null,
    onlineReceiptUrl,
    /** QZ Tray takes raw bytes as base64 (`{ type: 'raw', format: 'base64' }`). */
    data: toBase64(renderTemplate(template, data, { widthMm: profile.widthMm })),
  };
}

/**
 * The receipt for an order the shop already has: looked up, checked against the staff member's
 * branches, and rendered for the printer it belongs on.
 */
export async function receiptJobForOrder(actor, orderId, { profileId } = {}) {
  const order = await providers.getOrder?.(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.branchId) actor.assertBranch(order.branchId);
  const saved = await repo.getReceiptTemplate();
  const shop = await resolveShop(saved.lang === 'ar' ? 'ar' : 'en');
  return buildReceiptJob(order, { profileId, shop, lang: saved.lang });
}

/**
 * Builds a barcode label print job for a product variant or explicit label fields.
 */
export async function buildLabelJob(_actor, input) {
  const [profile, saved] = await Promise.all([
    profileFor('label', { profileId: input.profileId, branchId: null }),
    repo.getLabelTemplate(),
  ]);
  let item = input;
  if (input.variantId) {
    const resolved = await providers.getVariant?.(input.variantId);
    if (!resolved) throw new NotFoundError('Variant not found');
    item = resolved;
  }
  const shop = await resolveShop('en');
  const data = labelData(item, { shop, currency: getSetting('store.currency') });
  const compiled = buildLabelTemplate(saved).filter((block) => block.type !== 'cut' || profile.cut);
  const copies = input.copies ?? 1;
  const repeated = Array.from({ length: copies }, () => compiled).flat();
  const bytes = renderTemplate(repeated, data, { widthMm: profile.widthMm });
  return {
    printer: profile.printer,
    profileId: str(profile._id),
    widthMm: saved.widthMm,
    heightMm: saved.heightMm,
    copies,
    lines: previewLines(renderTemplate(compiled, data, { widthMm: profile.widthMm })),
    data: toBase64(bytes),
  };
}

/**
 * Builds a thermal ESC/POS print job for a shift X-Report or Z-Report (P6.5).
 */
export async function buildShiftReportJob(
  shift,
  { kind = 'x', profileId, branchId = shift.branchId } = {},
) {
  const profile = await profileFor('receipt', { profileId, branchId });
  const shop = await resolveShop('en');
  const data = shiftReportData(shift, {
    kind,
    shop,
    currency: getSetting('store.currency'),
    lang: 'en',
    timeZone: getSetting('store.timeZone'),
  });
  const compiled = buildShiftReportTemplate({ kind }).filter(
    (block) => block.type !== 'cut' || profile.cut,
  );
  const bytes = renderTemplate(compiled, data, { widthMm: profile.widthMm });
  return {
    printer: profile.printer,
    profileId: str(profile._id),
    widthMm: profile.widthMm,
    kind,
    lines: previewLines(bytes),
    data: toBase64(bytes),
  };
}

/**
 * Builds an ESC/POS cash-drawer kick print job (`ESC p`, P6.5).
 */
export async function buildDrawerKickJob({ branchId, profileId } = {}) {
  const profile = await profileFor('receipt', { profileId, branchId });
  const bytes = renderEscPos([{ type: 'drawer' }], { widthMm: profile.widthMm });
  return {
    printer: profile.printer,
    profileId: str(profile._id),
    widthMm: profile.widthMm,
    data: toBase64(bytes),
  };
}

/**
 * Builds a thermal ESC/POS print job for a return credit note or exchange receipt (P6.6).
 */
export async function buildReturnReceiptJob(
  record,
  { profileId, branchId = record.branchId } = {},
) {
  const profile = await profileFor('receipt', { profileId, branchId });
  const shop = await resolveShop('en');
  const qr = zatcaQr({
    sellerName: shop.name,
    vatNumber: shop.vatNumber,
    timestamp: record.createdAt,
    total:
      record.type === 'exchange' ? (record.differenceDue ?? 0) : (record.returnTotals?.total ?? 0),
    vat:
      record.type === 'exchange'
        ? Math.max(0, (record.exchangeTotals?.vat ?? 0) - (record.returnTotals?.vat ?? 0))
        : (record.returnTotals?.vat ?? 0),
  });
  const data = returnReceiptData(
    { ...record, zatcaQr: qr },
    {
      shop,
      branch: record.branchName ?? null,
      cashier: record.staffName ?? null,
      currency: getSetting('store.currency'),
      lang: 'en',
      timeZone: getSetting('store.timeZone'),
    },
  );
  const openDrawer =
    profile.openDrawer &&
    (record.refundMethod === 'cash' ||
      (record.payments ?? []).some((p) => p.method === 'cash' || p.methodType === 'cash'));
  const compiled = buildReturnReceiptTemplate({
    cut: profile.cut,
    openDrawer,
  });
  const bytes = renderTemplate(compiled, data, { widthMm: profile.widthMm });
  return {
    printer: profile.printer,
    profileId: str(profile._id),
    widthMm: profile.widthMm,
    lines: previewLines(bytes),
    data: toBase64(bytes),
  };
}
