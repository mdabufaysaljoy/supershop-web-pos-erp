import { z } from 'zod';
import { V } from '../validators/messages.js';
import { moneyMinor, objectId, paginationQuery, plainText } from '../validators/fields.js';

/**
 * Purchase orders (P2.3, "light"): what was ordered from a supplier for one branch, at what unit
 * cost, and how much has arrived. Receiving books stock through the inventory ledger.
 * Unit costs are integer halalas, excluding VAT.
 */
export const PURCHASE = Object.freeze({
  STATUSES: Object.freeze([
    'draft',
    'ordered',
    'partially_received',
    'received',
    'closed',
    'cancelled',
  ]),
  /** What happens to a variant's cost when goods arrive (setting `purchase.costMethod`). */
  COST_METHODS: Object.freeze(['none', 'last', 'average']),
  MAX_LINES: 300,
  /** Keeps every total a safe integer: 300 × 100k × 1M SAR in halalas < 2^53. */
  MAX_QTY: 100_000,
  MAX_UNIT_COST: 100_000_000,
  NOTE_MAX: 1000,
  REFERENCE_MAX: 60,
});

/**
 * Allowed transitions (one place; the service enforces them).
 * `receive` → partially_received | received, decided by the quantities.
 */
export const PURCHASE_TRANSITIONS = Object.freeze({
  order: Object.freeze(['draft']),
  receive: Object.freeze(['ordered', 'partially_received']),
  close: Object.freeze(['partially_received']),
  cancel: Object.freeze(['draft', 'ordered']),
  /** Header + line edits. */
  edit: Object.freeze(['draft', 'ordered', 'partially_received']),
});

const qty = z.preprocess(
  (v) => (typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v),
  z
    .number({ error: V.QTY_INVALID })
    .int({ error: V.QTY_INVALID })
    .min(1, { error: V.QTY_INVALID })
    .max(PURCHASE.MAX_QTY, { error: V.QTY_TOO_LARGE }),
);
const note = plainText({ max: PURCHASE.NOTE_MAX });
const reference = plainText({ max: PURCHASE.REFERENCE_MAX });
/** `YYYY-MM-DD` (store-local date) or null. */
const date = z.iso.date({ error: V.INVALID_TYPE }).nullable();

const uniqueVariants = (lines, ctx) => {
  const seen = new Set();
  lines.forEach((l, i) => {
    if (seen.has(l.variantId))
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'variantId'], message: V.DUPLICATE });
    seen.add(l.variantId);
  });
};

export function createPurchaseOrderSchemas() {
  const line = z.object({
    variantId: objectId,
    qty,
    unitCost: moneyMinor({ max: PURCHASE.MAX_UNIT_COST }),
  });
  const lines = z.array(line, { error: V.INVALID_TYPE }).max(PURCHASE.MAX_LINES, {
    error: V.TOO_LONG,
  });
  const fields = {
    supplierId: objectId,
    branchId: objectId,
    expectedAt: date.optional(),
    reference: reference.optional(),
    note: note.optional(),
    /** The COMPLETE set of lines (one per variant). */
    lines,
  };
  return {
    idParam: z.object({ id: objectId }),
    listQuery: paginationQuery({
      sortable: ['createdAt', 'expectedAt', 'poNo'],
      defaultSort: '-createdAt',
    }).extend({
      status: z.enum(PURCHASE.STATUSES, { error: V.INVALID_TYPE }).optional(),
      supplierId: objectId.optional(),
      branchId: objectId.optional(),
      /** PO number or supplier reference. */
      q: plainText({ max: 60 }).optional(),
    }),
    create: z
      .object({ ...fields, lines: lines.default([]) })
      .superRefine((v, ctx) => uniqueVariants(v.lines, ctx)),
    update: z
      .object({
        supplierId: fields.supplierId.optional(),
        branchId: fields.branchId.optional(),
        expectedAt: fields.expectedAt,
        reference: fields.reference,
        note: fields.note,
        lines: lines.optional(),
      })
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED })
      .superRefine((v, ctx) => v.lines && uniqueVariants(v.lines, ctx)),
    receive: z
      .object({
        lines: z
          .array(z.object({ variantId: objectId, qty }), { error: V.INVALID_TYPE })
          .min(1, { error: V.REQUIRED })
          .max(PURCHASE.MAX_LINES, { error: V.TOO_LONG }),
        /** Supplier delivery note number for this delivery. */
        reference: reference.optional(),
        note: note.optional(),
      })
      .superRefine((v, ctx) => uniqueVariants(v.lines, ctx)),
    /** order / close / cancel */
    action: z.object({ note: note.optional() }),
  };
}

/** Line total and PO totals in halalas (pure; used by API and admin). */
export function purchaseTotals(lines) {
  let ordered = 0;
  let received = 0;
  let units = 0;
  let unitsReceived = 0;
  for (const l of lines) {
    ordered += l.qtyOrdered * l.unitCost;
    received += (l.qtyReceived ?? 0) * l.unitCost;
    units += l.qtyOrdered;
    unitsReceived += l.qtyReceived ?? 0;
  }
  return { ordered, received, units, unitsReceived };
}

/**
 * Next unit cost of a variant after receiving goods.
 * - `last`: the received unit cost.
 * - `average`: moving weighted average over the stock on hand (all branches) before the receipt;
 *   with no usable history (no cost yet, or nothing on hand) it is the received cost.
 * Returns `oldCost` unchanged for `none`. Integer halalas (rounded half up).
 */
export function nextUnitCost(method, { oldCost, onHand, qty, unitCost }) {
  if (method === 'none') return oldCost ?? null;
  if (method === 'last' || oldCost == null || onHand <= 0) return unitCost;
  return Math.round((onHand * oldCost + qty * unitCost) / (onHand + qty));
}
