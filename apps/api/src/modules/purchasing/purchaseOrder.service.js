import {
  ERROR_CODES,
  EVENTS,
  nextUnitCost,
  PERMISSIONS as P,
  PURCHASE_TRANSITIONS,
  purchaseTotals,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import mongoose from 'mongoose';
import { formatSequence, nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import { findUnknownBranches, getBranchSummaries } from '../branches/index.js';
import {
  applyStockOperation,
  findOperationByIdempotencyKey,
  getTotalOnHand,
  publishStockResult,
} from '../inventory/index.js';
import {
  findStockableVariants,
  getVariantCosts,
  getVariantSummaries,
  publishCostChanges,
  setVariantCosts,
} from '../products/index.js';
import { getSetting } from '../settings/index.js';
import { getSuppliersByIds } from '../suppliers/index.js';
import * as repo from './purchaseOrder.repo.js';

/**
 * Purchase orders (P2.3): draft → ordered → partially_received → received, or closed (stop
 * waiting for the rest) / cancelled (nothing received). Receiving books a stock receipt in the
 * inventory ledger, updates the PO and (per `purchase.costMethod`) variant costs — all in ONE
 * transaction, so a PO never claims goods the ledger doesn't have.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));
const notFound = () => new NotFoundError('Purchase order not found');
const invalidState = (status) =>
  new AppError(ERROR_CODES.INVALID_STATE_TRANSITION, `Not possible while the order is ${status}`, {
    status: 409,
    details: [{ path: 'status', message: V.INVALID_TYPE, status }],
  });
const assertState = (po, action) => {
  if (!PURCHASE_TRANSITIONS[action].includes(po.status)) throw invalidState(po.status);
};
const emit = (actor, name, po, extra = {}) =>
  void eventBus.emit(name, {
    purchaseOrderId: str(po._id),
    poNo: po.poNo,
    actorId: actor.staffId,
    ...extra,
  });
const auditView = (po) => ({
  status: po.status,
  supplierName: po.supplierName,
  branchId: str(po.branchId),
  expectedAt: po.expectedAt,
  reference: po.reference,
  lineCount: po.lines.length,
  totalOrdered: po.totalOrdered,
});

/** Loads a PO the actor may see (out of scope reads as "not found"). */
async function loadVisible(actor, id) {
  const po = await repo.findById(id);
  if (!po || !actor.canAccessBranch(po.branchId)) throw notFound();
  return po;
}

// ---------------------------------------------------------------- DTO

async function toDtos(actor, orders, { withLines = true } = {}) {
  const [variants, branches] = await Promise.all([
    withLines
      ? getVariantSummaries(
          orders.flatMap((o) => o.lines.map((l) => str(l.variantId))),
          { withCost: actor.can(P.PRODUCT_VIEW_COST) },
        )
      : new Map(),
    getBranchSummaries(orders.map((o) => str(o.branchId))),
  ]);
  return orders.map((o) => {
    const totals = purchaseTotals(o.lines);
    return {
      id: str(o._id),
      poNo: o.poNo,
      status: o.status,
      supplier: { id: str(o.supplierId), name: o.supplierName },
      branch: branches.get(str(o.branchId)) ?? null,
      expectedAt: o.expectedAt ?? null,
      reference: o.reference ?? null,
      note: o.note ?? '',
      totals,
      lineCount: o.lines.length,
      ...(withLines && {
        lines: o.lines.map((l) => ({
          variantId: str(l.variantId),
          variant: variants.get(str(l.variantId)) ?? null,
          qtyOrdered: l.qtyOrdered,
          qtyReceived: l.qtyReceived,
          unitCost: l.unitCost,
          total: l.qtyOrdered * l.unitCost,
        })),
        receipts: (o.receipts ?? []).map((r) => ({
          operationId: str(r.operationId),
          docNo: r.docNo,
          reference: r.reference ?? null,
          units: r.units,
          value: r.value,
          actorId: str(r.actorId),
          at: r.at,
        })),
      }),
      orderedAt: o.orderedAt ?? null,
      closedAt: o.closedAt ?? null,
      cancelledAt: o.cancelledAt ?? null,
      createdBy: str(o.createdBy),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  });
}
const toDto = async (actor, po) => (await toDtos(actor, [po]))[0];

// ---------------------------------------------------------------- validation helpers

/** Active supplier → name snapshot. */
async function supplierName(supplierId) {
  const [s] = await getSuppliersByIds([supplierId]);
  if (!s || !s.isActive) throw new ValidationError([{ path: 'supplierId', message: V.ID_INVALID }]);
  return s.name;
}

async function assertBranch(actor, branchId) {
  actor.assertBranch(branchId);
  if ((await findUnknownBranches([branchId])).length)
    throw new ValidationError([{ path: 'branchId', message: V.ID_INVALID }]);
}

/**
 * New line set merged with what was already received: received lines can't be removed, ordered
 * below what arrived, or re-priced (their received value is history).
 */
async function buildLines(input, existing = []) {
  const byVariant = new Map(existing.map((l) => [str(l.variantId), l]));
  const stockable = await findStockableVariants(input.map((l) => l.variantId));
  const issues = [];
  const lines = input.map((l, i) => {
    const prev = byVariant.get(l.variantId);
    const received = prev?.qtyReceived ?? 0;
    if (!prev && !stockable.has(l.variantId))
      issues.push({ path: `lines.${i}.variantId`, message: V.ID_INVALID });
    if (l.qty < received) issues.push({ path: `lines.${i}.qty`, message: V.TOO_SHORT });
    if (received > 0 && l.unitCost !== prev.unitCost)
      issues.push({ path: `lines.${i}.unitCost`, message: V.INVALID_TYPE });
    return {
      variantId: oid(l.variantId),
      productId: prev?.productId ?? oid(stockable.get(l.variantId)?.productId ?? l.variantId),
      qtyOrdered: l.qty,
      qtyReceived: received,
      unitCost: l.unitCost,
    };
  });
  const kept = new Set(input.map((l) => l.variantId));
  existing.forEach((l) => {
    if (l.qtyReceived > 0 && !kept.has(str(l.variantId)))
      issues.push({ path: 'lines', message: V.REQUIRED, variantId: str(l.variantId) });
  });
  if (issues.length) throw new ValidationError(issues);
  return lines;
}

/** Status implied by the quantities (for orders that are past draft). */
function receivingStatus(lines) {
  const any = lines.some((l) => l.qtyReceived > 0);
  const all = lines.length > 0 && lines.every((l) => l.qtyReceived >= l.qtyOrdered);
  return all ? 'received' : any ? 'partially_received' : 'ordered';
}

function setTotals(doc) {
  const t = purchaseTotals(doc.lines);
  doc.totalOrdered = t.ordered;
  doc.totalReceived = t.received;
}

// ---------------------------------------------------------------- queries

export async function listPurchaseOrders(actor, query) {
  const { items, total } = await repo.listOrders(
    {
      scope: actor.branchFilter('branchId', query.branchId ?? null),
      status: query.status,
      supplierId: query.supplierId ? oid(query.supplierId) : null,
      q: query.q,
    },
    {
      sort: { [query.sort.field]: query.sort.direction },
      skip: (query.page - 1) * query.limit,
      limit: query.limit,
    },
  );
  return {
    items: await toDtos(actor, items, { withLines: false }),
    meta: { page: query.page, limit: query.limit, total },
  };
}

export async function getPurchaseOrder(actor, id) {
  return toDto(actor, await loadVisible(actor, id));
}

// ---------------------------------------------------------------- commands

export async function createPurchaseOrder(actor, input) {
  await assertBranch(actor, input.branchId);
  const name = await supplierName(input.supplierId);
  const lines = await buildLines(input.lines);
  const t = purchaseTotals(lines);
  const po = await repo.createOrder({
    poNo: formatSequence(await nextSequence('purchaseOrder'), { prefix: 'PO-' }),
    status: 'draft',
    supplierId: oid(input.supplierId),
    supplierName: name,
    branchId: oid(input.branchId),
    expectedAt: input.expectedAt ?? null,
    reference: input.reference || null,
    note: input.note ?? '',
    lines,
    totalOrdered: t.ordered,
    totalReceived: 0,
    createdBy: oid(actor.staffId),
  });
  emit(actor, EVENTS.PURCHASE_ORDER_CREATED, po, { after: auditView(po) });
  return toDto(actor, po);
}

export async function updatePurchaseOrder(actor, id, input) {
  await loadVisible(actor, id);
  if (input.branchId) await assertBranch(actor, input.branchId);
  const name = input.supplierId ? await supplierName(input.supplierId) : null;

  const { before, after } = await withTransaction(async (session) => {
    const doc = await repo.loadForUpdate(id, session);
    if (!doc) throw notFound();
    assertState(doc, 'edit');
    const snapshot = auditView(doc.toObject());
    const received = doc.lines.some((l) => l.qtyReceived > 0);
    // Who/where can only change before anything arrived (receipts belong to a branch).
    if (input.supplierId && input.supplierId !== str(doc.supplierId)) {
      if (doc.status !== 'draft') throw invalidState(doc.status);
      doc.supplierId = oid(input.supplierId);
      doc.supplierName = name;
    }
    if (input.branchId && input.branchId !== str(doc.branchId)) {
      if (received) throw invalidState(doc.status);
      doc.branchId = oid(input.branchId);
    }
    if (input.expectedAt !== undefined) doc.expectedAt = input.expectedAt;
    if (input.reference !== undefined) doc.reference = input.reference || null;
    if (input.note !== undefined) doc.note = input.note;
    if (input.lines) {
      const lines = await buildLines(input.lines, doc.toObject().lines);
      if (doc.status !== 'draft' && !lines.length)
        throw new ValidationError([{ path: 'lines', message: V.REQUIRED }]);
      doc.lines = lines;
      if (doc.status !== 'draft') doc.status = receivingStatus(lines);
    }
    setTotals(doc);
    return { before: snapshot, after: await repo.saveDoc(doc, session) };
  });
  emit(actor, EVENTS.PURCHASE_ORDER_UPDATED, after, { before, after: auditView(after) });
  return toDto(actor, after);
}

/** draft → ordered / partially_received → closed / draft|ordered → cancelled. */
async function transition(actor, id, action, { note } = {}) {
  await loadVisible(actor, id);
  const po = await withTransaction(async (session) => {
    const doc = await repo.loadForUpdate(id, session);
    if (!doc) throw notFound();
    assertState(doc, action);
    if (action === 'cancel' && doc.lines.some((l) => l.qtyReceived > 0))
      throw invalidState(doc.status);
    if (action === 'order' && !doc.lines.length)
      throw new ValidationError([{ path: 'lines', message: V.REQUIRED }]);
    const now = new Date();
    if (action === 'order') Object.assign(doc, { status: 'ordered', orderedAt: now });
    if (action === 'close') Object.assign(doc, { status: 'closed', closedAt: now });
    if (action === 'cancel') Object.assign(doc, { status: 'cancelled', cancelledAt: now });
    if (note) doc.note = doc.note ? `${doc.note}\n${note}` : note;
    return repo.saveDoc(doc, session);
  });
  const event = {
    order: EVENTS.PURCHASE_ORDER_ORDERED,
    close: EVENTS.PURCHASE_ORDER_CLOSED,
    cancel: EVENTS.PURCHASE_ORDER_CANCELLED,
  }[action];
  emit(actor, event, po, { status: po.status, ...(note && { note }) });
  return toDto(actor, po);
}
export const placePurchaseOrder = (actor, id, input) => transition(actor, id, 'order', input);
export const closePurchaseOrder = (actor, id, input) => transition(actor, id, 'close', input);
export const cancelPurchaseOrder = (actor, id, input) => transition(actor, id, 'cancel', input);

/**
 * Receives (part of) a PO into its branch: stock receipt in the ledger + received quantities +
 * variant costs, atomically. With an idempotency key a retried request returns the PO unchanged.
 * @returns {Promise<{ order: object, replayed: boolean }>}
 */
export async function receivePurchaseOrder(actor, id, input, idempotencyKey = null) {
  await loadVisible(actor, id);
  const key = idempotencyKey ? `${actor.staffId}:${idempotencyKey}` : null;
  if (key) {
    const replay = await replayed(actor, id, key);
    if (replay) return replay;
  }
  const method = getSetting('purchase.costMethod');

  let outcome;
  try {
    outcome = await withTransaction(async (session) => {
      const doc = await repo.loadForUpdate(id, session);
      if (!doc) throw notFound();
      assertState(doc, 'receive');
      const lines = new Map(doc.lines.map((l) => [str(l.variantId), l]));
      const issues = [];
      input.lines.forEach((r, i) => {
        const line = lines.get(r.variantId);
        if (!line) issues.push({ path: `lines.${i}.variantId`, message: V.ID_INVALID });
        else if (r.qty > line.qtyOrdered - line.qtyReceived)
          issues.push({
            path: `lines.${i}.qty`,
            message: V.QTY_TOO_LARGE,
            remaining: line.qtyOrdered - line.qtyReceived,
          });
      });
      if (issues.length) throw new ValidationError(issues);

      const ids = input.lines.map((r) => r.variantId);
      // Costing needs the stock and costs BEFORE this receipt (same snapshot as the booking).
      const [onHand, costs] =
        method === 'none'
          ? [new Map(), new Map()]
          : await Promise.all([
              getTotalOnHand(ids, { session }),
              getVariantCosts(ids, { session }),
            ]);

      const result = await applyStockOperation(
        {
          type: 'receive',
          branchId: str(doc.branchId),
          supplierId: str(doc.supplierId),
          reference: input.reference || doc.reference || undefined,
          note: input.note ?? `${doc.poNo}`,
          lines: input.lines.map((r) => ({
            variantId: r.variantId,
            qty: r.qty,
            unitCost: lines.get(r.variantId).unitCost,
          })),
          ref: { type: 'purchaseOrder', id: str(doc._id) },
        },
        { session, actor, idempotencyKey: key },
      );

      let units = 0;
      let value = 0;
      for (const r of input.lines) {
        const line = lines.get(r.variantId);
        line.qtyReceived += r.qty;
        units += r.qty;
        value += r.qty * line.unitCost;
      }
      doc.status = receivingStatus(doc.lines);
      doc.receipts.push({
        operationId: result.operation._id,
        docNo: result.operation.docNo,
        reference: input.reference || null,
        units,
        value,
        actorId: oid(actor.staffId),
        at: new Date(),
      });
      setTotals(doc);
      const saved = await repo.saveDoc(doc, session);

      const costChanges =
        method === 'none'
          ? []
          : await setVariantCosts(
              input.lines.map((r) => ({
                variantId: r.variantId,
                cost: nextUnitCost(method, {
                  oldCost: costs.get(r.variantId)?.cost ?? null,
                  onHand: onHand.get(r.variantId) ?? 0,
                  qty: r.qty,
                  unitCost: lines.get(r.variantId).unitCost,
                }),
              })),
              { session },
            );
      return { saved, result, costChanges };
    });
  } catch (err) {
    if (key && isDuplicateKey(err, 'idempotencyKey')) {
      const replay = await replayed(actor, id, key);
      if (replay) return replay;
    }
    throw err;
  }

  const { saved, result, costChanges } = outcome;
  publishStockResult(result);
  publishCostChanges(costChanges, { actorId: actor.staffId, source: 'purchaseOrder' });
  emit(actor, EVENTS.PURCHASE_ORDER_RECEIVED, saved, {
    status: saved.status,
    operationId: str(result.operation._id),
    docNo: result.operation.docNo,
    lines: input.lines.map((r) => ({ variantId: r.variantId, qty: r.qty })),
  });
  return { order: await toDto(actor, saved), replayed: false };
}

/** A receipt already booked under this key: same PO → its current state; else a conflict. */
async function replayed(actor, id, key) {
  const op = await findOperationByIdempotencyKey(key);
  if (!op) return null;
  if (op.refType !== 'purchaseOrder' || str(op.refId) !== String(id)) {
    throw new AppError(ERROR_CODES.IDEMPOTENCY_CONFLICT, 'Idempotency key already used', {
      status: 409,
    });
  }
  return { order: await toDto(actor, await repo.findById(id)), replayed: true };
}

// ---------------------------------------------------------------- other modules

export const countPurchaseOrdersOfSupplier = (supplierId) => repo.countBySupplier(oid(supplierId));
export const countPurchaseOrdersInBranch = (branchId) => repo.countByBranch(oid(branchId));
