import { z } from 'zod';
import { PAPER } from '../printing/escpos.js';
import {
  DEFAULT_LABEL_CONFIG,
  DEFAULT_RECEIPT_CONFIG,
  RECEIPT_LANGUAGES,
} from '../printing/template.js';
import { V } from '../validators/messages.js';
import { barcode, objectId, plainText, sku } from '../validators/fields.js';

/**
 * Printing contracts (P6.3, P6.4): the printers a shop has, the signing call QZ Tray makes before
 * it will talk to them, and the receipt & barcode label templates.
 */
export const PRINTING = Object.freeze({
  KINDS: Object.freeze(['receipt', 'label']),
  WIDTHS_MM: PAPER.WIDTHS_MM,
  RECEIPT_LANGUAGES,
  LABEL_WIDTH_MIN: 20,
  LABEL_WIDTH_MAX: 100,
  LABEL_HEIGHT_MIN: 15,
  LABEL_HEIGHT_MAX: 100,
  BARCODE_HEIGHT_MIN: 30,
  BARCODE_HEIGHT_MAX: 120,
  /** QZ hashes the call it wants signed; anything longer than this is not one of ours. */
  SIGN_MAX: 4000,
});

const bool = () => z.boolean({ error: V.INVALID_TYPE });
const intRange = (min, max) =>
  z
    .number({ error: V.INVALID_TYPE })
    .int({ error: V.INVALID_TYPE })
    .min(min, { error: V.TOO_SHORT })
    .max(max, { error: V.TOO_LONG });

const widthMmSchema = z.union(
  PRINTING.WIDTHS_MM.map((mm) => z.literal(mm)),
  { error: V.INVALID_TYPE },
);

const profileFields = {
  name: plainText({ min: 1, max: 60 }),
  /** The printer's name as the operating system (and so QZ Tray) knows it. */
  printer: plainText({ min: 1, max: 120 }),
  kind: z.enum(PRINTING.KINDS, { error: V.INVALID_TYPE }),
  widthMm: widthMmSchema,
  /** Only this branch's tills use it; null = any branch. */
  branchId: objectId.nullable(),
  /** Cut the paper after a receipt, and kick the cash drawer open. */
  cut: bool(),
  openDrawer: bool(),
  isDefault: bool(),
};

const localizedText = (opts) =>
  z.union([plainText(opts), z.object({ en: plainText(opts) }).strict()]);

const receiptFieldsSchema = z
  .object(
    Object.fromEntries(Object.keys(DEFAULT_RECEIPT_CONFIG.fields).map((key) => [key, bool()])),
  )
  .partial()
  .strict();

const receiptLabelsSchema = z
  .object(
    Object.fromEntries(
      Object.keys(DEFAULT_RECEIPT_CONFIG.labels).map((key) => [
        key,
        localizedText({ min: 1, max: 40 }),
      ]),
    ),
  )
  .partial()
  .strict();

const labelFieldsSchema = z
  .object(Object.fromEntries(Object.keys(DEFAULT_LABEL_CONFIG.fields).map((key) => [key, bool()])))
  .partial()
  .strict();

export function createPrintingSchemas() {
  return {
    idParam: z.object({ id: objectId }),
    listQuery: z
      .object({
        kind: z.enum(PRINTING.KINDS, { error: V.INVALID_TYPE }).optional(),
        branchId: objectId.optional(),
      })
      .strict(),
    create: z
      .object({
        ...profileFields,
        kind: profileFields.kind.default('receipt'),
        widthMm: profileFields.widthMm.default(80),
        branchId: profileFields.branchId.default(null),
        cut: profileFields.cut.default(true),
        openDrawer: profileFields.openDrawer.default(false),
        isDefault: profileFields.isDefault.default(false),
      })
      .strict(),
    update: z
      .object(profileFields)
      .partial()
      .strict()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
    /** What QZ Tray asks the shop's own server to sign. */
    sign: z
      .object({ data: z.string({ error: V.INVALID_TYPE }).min(1).max(PRINTING.SIGN_MAX) })
      .strict(),
    /** A print job for an order: which profile, and (later) which template. */
    jobQuery: z.object({ profileId: objectId.optional() }).strict(),
    /** Receipt template editor (P6.4). */
    receiptTemplate: z
      .object({
        lang: z.enum(PRINTING.RECEIPT_LANGUAGES, { error: V.INVALID_TYPE }).optional(),
        widthMm: widthMmSchema.optional(),
        logoMediaId: objectId.nullable().optional(),
        headerText: localizedText({ max: 160 }).optional(),
        footerText: localizedText({ max: 160 }).optional(),
        fields: receiptFieldsSchema.optional(),
        labels: receiptLabelsSchema.optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
    /** Barcode label template editor (P6.4). */
    labelTemplate: z
      .object({
        widthMm: intRange(PRINTING.LABEL_WIDTH_MIN, PRINTING.LABEL_WIDTH_MAX).optional(),
        heightMm: intRange(PRINTING.LABEL_HEIGHT_MIN, PRINTING.LABEL_HEIGHT_MAX).optional(),
        barcodeHeight: intRange(
          PRINTING.BARCODE_HEIGHT_MIN,
          PRINTING.BARCODE_HEIGHT_MAX,
        ).optional(),
        fields: labelFieldsSchema.optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
    /** A barcode label print job: either a variant by id or explicit label fields. */
    labelJob: z
      .object({
        variantId: objectId.optional(),
        profileId: objectId.optional(),
        name: plainText({ min: 1, max: 120 }).optional(),
        variant: plainText({ max: 80 }).optional(),
        sku: sku.optional(),
        barcode: barcode.optional(),
        price: intRange(0, 100_000_000).optional(),
        copies: intRange(1, 50).default(1),
      })
      .strict()
      .refine((v) => Boolean(v.variantId || (v.name && (v.barcode || v.sku))), {
        error: V.REQUIRED,
      }),
  };
}
