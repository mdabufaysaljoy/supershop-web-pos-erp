import { z } from 'zod';
import { normalizeDigits } from '../digits.js';
import { V } from '../validators/messages.js';
import { moneyMinor, objectId, paginationQuery, plainText } from '../validators/fields.js';

/**
 * Inventory contracts (P2.2). Stock is an append-only ledger of movements; the quantity on hand
 * per (variant, branch) is a cached level changed only together with a ledger row.
 * Quantities are whole units.
 */
export const STOCK = Object.freeze({
  /** Ledger row types. Signed `delta`: + into the branch, − out of it. */
  MOVEMENT_TYPES: Object.freeze([
    'receive',
    'adjust',
    'transfer_out',
    'transfer_in',
    'sale',
    'return',
  ]),
  /** One operation (document) groups the movements it caused. */
  OPERATION_TYPES: Object.freeze(['receive', 'adjust', 'transfer', 'sale', 'return']),
  ADJUST_REASONS: Object.freeze([
    'count',
    'damaged',
    'expired',
    'lost',
    'found',
    'correction',
    'other',
  ]),
  /** Document number prefixes per operation type (e.g. ADJ-000042). */
  DOC_PREFIX: Object.freeze({
    receive: 'GRN-',
    adjust: 'ADJ-',
    transfer: 'TRF-',
    sale: 'SAL-',
    return: 'RTN-',
  }),
  MAX_LINES: 500,
  MAX_QTY: 1_000_000,
  NOTE_MAX: 500,
  REFERENCE_MAX: 60,
});

/** Whole number in [min, max]; digit strings (Arabic digits too) accepted for query/form input. */
const int = (min, max) =>
  z.preprocess(
    (v) =>
      typeof v === 'string' && /^\s*-?[\d٠-٩۰-۹]+\s*$/.test(v)
        ? Number(normalizeDigits(v.trim()))
        : v,
    z
      .number({ error: V.QTY_INVALID })
      .int({ error: V.QTY_INVALID })
      .min(min, { error: V.QTY_INVALID })
      .max(max, { error: V.QTY_TOO_LARGE }),
  );
const qty = () => int(1, STOCK.MAX_QTY);
const note = plainText({ max: STOCK.NOTE_MAX }).optional();
const boolParam = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v),
  z.boolean({ error: V.INVALID_TYPE }).optional(),
);
const isoDate = z.iso.datetime({ offset: true, error: V.INVALID_TYPE }).optional();

/** Lines may not repeat a variant (one ledger row per variant and branch per operation). */
const uniqueVariants = (lines, ctx) => {
  const seen = new Map();
  lines.forEach((l, i) => {
    if (seen.has(l.variantId))
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'variantId'], message: V.DUPLICATE });
    seen.set(l.variantId, i);
  });
};
const lines = (line) =>
  z
    .array(line, { error: V.INVALID_TYPE })
    .min(1, { error: V.REQUIRED })
    .max(STOCK.MAX_LINES, { error: V.TOO_LONG });

export function createInventorySchemas() {
  return {
    idParam: z.object({ id: objectId }),
    variantParam: z.object({ variantId: objectId }),

    levelsQuery: paginationQuery({
      sortable: ['onHand', 'updatedAt'],
      defaultSort: 'onHand',
      maxLimit: 200,
    }).extend({
      branchId: objectId.optional(),
      productId: objectId.optional(),
      variantId: objectId.optional(),
      /** SKU / barcode / product name. */
      q: plainText({ max: 100 }).optional(),
      /** Only levels at or below their low-stock threshold. */
      low: boolParam,
    }),

    movementsQuery: paginationQuery({ sortable: ['createdAt'], defaultSort: '-createdAt' }).extend({
      branchId: objectId.optional(),
      productId: objectId.optional(),
      variantId: objectId.optional(),
      operationId: objectId.optional(),
      type: z.enum(STOCK.MOVEMENT_TYPES, { error: V.INVALID_TYPE }).optional(),
      from: isoDate,
      to: isoDate,
    }),

    operationsQuery: paginationQuery({ sortable: ['createdAt'], defaultSort: '-createdAt' }).extend(
      {
        branchId: objectId.optional(),
        type: z.enum(STOCK.OPERATION_TYPES, { error: V.INVALID_TYPE }).optional(),
      },
    ),

    /**
     * Each line is EITHER a change (`delta`, ±) OR a physical count (`counted`, the new on-hand
     * quantity; the difference is booked). Counts are what stocktakes use.
     */
    adjust: z
      .object({
        branchId: objectId,
        reason: z.enum(STOCK.ADJUST_REASONS, { error: V.INVALID_TYPE }),
        note,
        lines: lines(
          z
            .object({
              variantId: objectId,
              delta: int(-STOCK.MAX_QTY, STOCK.MAX_QTY)
                .refine((d) => d !== 0, { error: V.QTY_INVALID })
                .optional(),
              counted: int(0, STOCK.MAX_QTY).optional(),
            })
            .superRefine((l, ctx) => {
              if ((l.delta === undefined) === (l.counted === undefined))
                ctx.addIssue({ code: 'custom', path: ['delta'], message: V.REQUIRED });
            }),
        ),
      })
      .superRefine((v, ctx) => uniqueVariants(v.lines, ctx)),

    transfer: z
      .object({
        fromBranchId: objectId,
        toBranchId: objectId,
        note,
        lines: lines(z.object({ variantId: objectId, qty: qty() })),
      })
      .superRefine((v, ctx) => {
        if (v.fromBranchId === v.toBranchId)
          ctx.addIssue({ code: 'custom', path: ['toBranchId'], message: V.DUPLICATE });
        uniqueVariants(v.lines, ctx);
      }),

    /** Goods received (without a purchase order; P2.3 receives against POs). */
    receive: z
      .object({
        branchId: objectId,
        supplierId: objectId.nullable().optional(),
        /** Supplier delivery note / invoice number. */
        reference: plainText({ max: STOCK.REFERENCE_MAX }).optional(),
        note,
        lines: lines(
          z.object({
            variantId: objectId,
            qty: qty(),
            /** Halalas per unit (needs product.viewCost to see later). */
            unitCost: moneyMinor().nullable().optional(),
          }),
        ),
      })
      .superRefine((v, ctx) => uniqueVariants(v.lines, ctx)),

    /** Per variant and branch; `null` = use the store default (setting). */
    threshold: z.object({
      branchId: objectId,
      variantId: objectId,
      lowStockThreshold: int(0, STOCK.MAX_QTY).nullable(),
    }),
  };
}
