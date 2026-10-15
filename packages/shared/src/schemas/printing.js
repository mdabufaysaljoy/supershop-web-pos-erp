import { z } from 'zod';
import { PAPER } from '../printing/escpos.js';
import { V } from '../validators/messages.js';
import { objectId, plainText } from '../validators/fields.js';

/**
 * Printing contracts (P6.3): the printers a shop has, and the signing call QZ Tray makes before
 * it will talk to them.
 */
export const PRINTING = Object.freeze({
  KINDS: Object.freeze(['receipt', 'label']),
  WIDTHS_MM: PAPER.WIDTHS_MM,
  /** QZ hashes the call it wants signed; anything longer than this is not one of ours. */
  SIGN_MAX: 4000,
});

const profileFields = {
  name: plainText({ min: 1, max: 60 }),
  /** The printer's name as the operating system (and so QZ Tray) knows it. */
  printer: plainText({ min: 1, max: 120 }),
  kind: z.enum(PRINTING.KINDS, { error: V.INVALID_TYPE }),
  widthMm: z.union(
    PRINTING.WIDTHS_MM.map((mm) => z.literal(mm)),
    { error: V.INVALID_TYPE },
  ),
  /** Only this branch's tills use it; null = any branch. */
  branchId: objectId.nullable(),
  /** Cut the paper after a receipt, and kick the cash drawer open. */
  cut: z.boolean({ error: V.INVALID_TYPE }),
  openDrawer: z.boolean({ error: V.INVALID_TYPE }),
  isDefault: z.boolean({ error: V.INVALID_TYPE }),
};

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
  };
}
