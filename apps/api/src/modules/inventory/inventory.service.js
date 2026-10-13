import { ERROR_CODES, EVENTS, PERMISSIONS as P, STOCK } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import mongoose from 'mongoose';
import { formatSequence, nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import {
  findUnknownBranches,
  getBranchSummaries,
  listBranchOptions,
  listOnlineBranchIds,
} from '../branches/index.js';
import { findStockableVariants, getVariantSummaries, matchVariantIds } from '../products/index.js';
import { getSetting } from '../settings/index.js';
import { getStaffNames } from '../staff/index.js';
import * as repo from './inventory.repo.js';

/**
 * Inventory (P2.2): append-only stock ledger + cached levels.
 *
 * Every change is a STOCK OPERATION (receive, adjust, transfer, sale, return) booked in ONE Mongo
 * transaction: operation header → for each line an atomic conditional `$inc` on the level (a
 * decrease only matches while enough is on hand) → ledger rows carrying the resulting balance.
 * Concurrent operations on the same level conflict and are retried by the transaction, so the
 * level always equals the sum of its ledger rows and never goes negative (unless allowed).
 * Events are published only after commit.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));
/** Manual operations get their own document number; sales/returns use their order's. */
const NUMBERED = new Set(['receive', 'adjust', 'transfer']);

const notFound = () => new NotFoundError('Stock operation not found');
const fallbackThreshold = () => getSetting('inventory.lowStockThreshold');

// ---------------------------------------------------------------- engine

/**
 * @typedef {object} StockLineInput
 * @property {string} variantId
 * @property {number} [qty]       receive / transfer / sale / return (positive)
 * @property {number} [delta]     adjust: signed change
 * @property {number} [counted]   adjust: counted quantity (the difference is booked)
 * @property {number | null} [unitCost]  receive: halalas per unit
 *
 * @typedef {object} StockOperationInput
 * @property {'receive'|'adjust'|'transfer'|'sale'|'return'} type
 * @property {string} branchId
 * @property {string} [toBranchId]      transfer destination
 * @property {StockLineInput[]} lines
 * @property {string} [reason]          adjust reason
 * @property {string} [note]
 * @property {string} [reference]       supplier document number
 * @property {string | null} [supplierId]
 * @property {{ type: string, id: string }} [ref]  source document in another module
 * @property {boolean} [allowNegative]  sales may oversell when the store allows it
 */

/** Branch + variant existence (and, with an actor, branch scope). Returns lines with productId. */
async function prepare(actor, input) {
  const branchIds = [input.branchId, input.toBranchId].filter(Boolean);
  if (actor) branchIds.forEach((id) => actor.assertBranch(id));
  const unknownBranches = new Set(await findUnknownBranches(branchIds));
  const issues = [];
  if (unknownBranches.has(input.branchId))
    issues.push({
      path: input.type === 'transfer' ? 'fromBranchId' : 'branchId',
      message: V.ID_INVALID,
    });
  if (input.toBranchId && unknownBranches.has(input.toBranchId))
    issues.push({ path: 'toBranchId', message: V.ID_INVALID });

  const variants = await findStockableVariants(input.lines.map((l) => l.variantId));
  input.lines.forEach((l, i) => {
    if (!variants.has(String(l.variantId)))
      issues.push({ path: `lines.${i}.variantId`, message: V.ID_INVALID });
  });
  if (issues.length) throw new ValidationError(issues);
  return {
    ...input,
    lines: input.lines.map((l, index) => ({
      ...l,
      index,
      productId: variants.get(String(l.variantId)).productId,
    })),
  };
}

/** Ledger postings (one per variant per branch) for a prepared operation. */
async function postingsFor(op, session) {
  const base = (l, branchId, delta, extra = {}) => ({
    index: l.index,
    variantId: oid(l.variantId),
    productId: oid(l.productId),
    branchId: oid(branchId),
    delta,
    countedQty: null,
    unitCost: null,
    ...extra,
  });
  switch (op.type) {
    case 'receive':
      return op.lines.map((l) =>
        base(l, op.branchId, l.qty, { type: 'receive', unitCost: l.unitCost ?? null }),
      );
    case 'sale':
      return op.lines.map((l) => base(l, op.branchId, -l.qty, { type: 'sale' }));
    case 'return':
      return op.lines.map((l) => base(l, op.branchId, l.qty, { type: 'return' }));
    case 'transfer':
      return op.lines.flatMap((l) => [
        base(l, op.branchId, -l.qty, { type: 'transfer_out' }),
        base(l, op.toBranchId, l.qty, { type: 'transfer_in' }),
      ]);
    case 'adjust': {
      // Counts are booked against what is on hand INSIDE the transaction (a concurrent change
      // conflicts and the whole operation is retried with fresh numbers).
      const counted = op.lines.filter((l) => l.counted !== undefined);
      const onHand = new Map(
        (counted.length
          ? await repo.findLevels(
              {
                branchId: oid(op.branchId),
                variantId: { $in: counted.map((l) => oid(l.variantId)) },
              },
              session,
            )
          : []
        ).map((lv) => [String(lv.variantId), lv.onHand]),
      );
      return op.lines.map((l) =>
        l.counted !== undefined
          ? base(l, op.branchId, l.counted - (onHand.get(String(l.variantId)) ?? 0), {
              type: 'adjust',
              countedQty: l.counted,
              allowNegative: true, // a count sets the quantity, whatever was booked before
            })
          : base(l, op.branchId, l.delta, { type: 'adjust' }),
      );
    }
    default:
      throw new Error(`Unknown stock operation ${op.type}`);
  }
}

function insufficientError(op, failures, levels) {
  const onHand = new Map(levels.map((lv) => [`${lv.variantId}:${lv.branchId}`, lv.onHand]));
  const field = op.type === 'adjust' ? 'delta' : 'qty';
  return new AppError(ERROR_CODES.INSUFFICIENT_STOCK, 'Not enough stock', {
    status: 409,
    details: failures.map((f) => ({
      path: `lines.${f.index}.${field}`,
      message: V.QTY_INSUFFICIENT,
      available: onHand.get(`${f.variantId}:${f.branchId}`) ?? 0,
    })),
  });
}

/** Books a prepared operation inside `session`. Pure DB work — safe to retry. */
async function book(op, { actorId, idempotencyKey }, session) {
  const at = new Date();
  const docNo = NUMBERED.has(op.type)
    ? formatSequence(await nextSequence(`stock:${op.type}`, { session }), {
        prefix: STOCK.DOC_PREFIX[op.type],
      })
    : null;
  const operation = await repo.insertOperation(
    {
      type: op.type,
      docNo,
      branchId: oid(op.branchId),
      toBranchId: op.toBranchId ? oid(op.toBranchId) : null,
      reason: op.reason ?? null,
      note: op.note ?? '',
      reference: op.reference || null,
      supplierId: op.supplierId ? oid(op.supplierId) : null,
      refType: op.ref?.type ?? null,
      refId: op.ref?.id ? oid(op.ref.id) : null,
      lineCount: op.lines.length,
      actorId: actorId ? oid(actorId) : null,
      idempotencyKey: idempotencyKey ?? null,
    },
    session,
  );

  // Fixed write order (branch, variant) keeps concurrent operations from interleaving oddly.
  const postings = (await postingsFor(op, session)).sort(
    (a, b) =>
      String(a.branchId).localeCompare(String(b.branchId)) ||
      String(a.variantId).localeCompare(String(b.variantId)),
  );
  const failures = [];
  const movements = [];
  const changes = [];
  for (const p of postings) {
    const level = await repo.changeLevel(
      { ...p, allowNegative: p.allowNegative || op.allowNegative === true, at },
      session,
    );
    if (!level) {
      failures.push(p);
      continue;
    }
    movements.push({
      operationId: operation._id,
      type: p.type,
      variantId: p.variantId,
      productId: p.productId,
      branchId: p.branchId,
      delta: p.delta,
      balanceAfter: level.onHand,
      countedQty: p.countedQty,
      unitCost: p.unitCost,
      actorId: operation.actorId,
    });
    changes.push({
      variantId: str(p.variantId),
      productId: str(p.productId),
      branchId: str(p.branchId),
      delta: p.delta,
      balanceAfter: level.onHand,
      threshold: level.lowStockThreshold ?? null,
    });
  }
  if (failures.length) {
    const levels = await repo.findLevels(
      { $or: failures.map((f) => ({ variantId: f.variantId, branchId: f.branchId })) },
      session,
    );
    throw insufficientError(op, failures, levels);
  }
  const inserted = await repo.insertMovements(movements, session);
  return { operation, movements: inserted.map((m) => m.toObject()), changes };
}

/**
 * For other modules (orders, POS, returns, purchase orders) that already run a transaction:
 * books the operation in THEIR `session`. After the transaction commits, call
 * `publishStockResult(result)` so stock events go out. `actor` (optional) enforces branch scope.
 * @param {StockOperationInput} input
 * @param {{ session: import('mongoose').ClientSession, actor?: object | null, actorId?: string | null }} ctx
 */
export async function applyStockOperation(
  input,
  { session, actor = null, actorId = null, idempotencyKey = null },
) {
  const op = await prepare(actor, input);
  return book(op, { actorId: actorId ?? actor?.staffId ?? null, idempotencyKey }, session);
}

/** Stock operation already booked with this idempotency key (callers handle their replays). */
export const findOperationByIdempotencyKey = (key) => repo.findOperationByKey(key);

/** Emits `stock.moved` and low/out alerts for a committed operation. */
export function publishStockResult({ operation, changes }) {
  void eventBus.emit(EVENTS.STOCK_MOVED, {
    operationId: str(operation._id),
    docNo: operation.docNo,
    type: operation.type,
    branchId: str(operation.branchId),
    toBranchId: str(operation.toBranchId),
    reason: operation.reason,
    refType: operation.refType,
    refId: str(operation.refId),
    actorId: str(operation.actorId),
    lines: changes.map(({ threshold: _t, ...c }) => c),
  });
  const fallback = fallbackThreshold();
  for (const c of changes) {
    if (c.delta >= 0) continue;
    const before = c.balanceAfter - c.delta;
    const threshold = c.threshold ?? fallback;
    const payload = {
      variantId: c.variantId,
      productId: c.productId,
      branchId: c.branchId,
      onHand: c.balanceAfter,
      threshold,
    };
    if (before > 0 && c.balanceAfter <= 0) void eventBus.emit(EVENTS.STOCK_OUT, payload);
    else if (before > threshold && c.balanceAfter <= threshold)
      void eventBus.emit(EVENTS.STOCK_LOW, payload);
  }
}

/**
 * Validates, books in its own transaction and publishes. With an idempotency key, a repeated
 * request returns the first result instead of booking twice.
 */
async function runOperation(actor, input, idempotencyKey) {
  const key = idempotencyKey ? `${actor.staffId}:${idempotencyKey}` : null;
  if (key) {
    const existing = await repo.findOperationByKey(key);
    if (existing) return replay(actor, existing, input.type);
  }
  const op = await prepare(actor, input);
  let result;
  try {
    result = await withTransaction((session) =>
      book(op, { actorId: actor.staffId, idempotencyKey: key }, session),
    );
  } catch (err) {
    if (key && isDuplicateKey(err, 'idempotencyKey')) {
      const existing = await repo.findOperationByKey(key);
      if (existing) return replay(actor, existing, input.type);
    }
    throw err;
  }
  publishStockResult(result);
  return { ...(await operationDetail(actor, result.operation, result.movements)), replayed: false };
}

async function replay(actor, operation, type) {
  if (operation.type !== type)
    throw new AppError(ERROR_CODES.IDEMPOTENCY_CONFLICT, 'Idempotency key already used', {
      status: 409,
    });
  return { ...(await operationDetail(actor, operation)), replayed: true };
}

// ---------------------------------------------------------------- manual operations (routes)

export const adjustStock = (actor, input, key) =>
  runOperation(actor, { ...input, type: 'adjust' }, key);

export const transferStock = (actor, { fromBranchId, ...input }, key) =>
  runOperation(actor, { ...input, branchId: fromBranchId, type: 'transfer' }, key);

export const receiveStock = (actor, input, key) =>
  runOperation(actor, { ...input, type: 'receive' }, key);

export async function setLowStockThreshold(actor, { branchId, variantId, lowStockThreshold }) {
  actor.assertBranch(branchId);
  const [unknown, variants] = await Promise.all([
    findUnknownBranches([branchId]),
    findStockableVariants([variantId]),
  ]);
  const issues = [
    ...(unknown.length ? [{ path: 'branchId', message: V.ID_INVALID }] : []),
    ...(variants.has(variantId) ? [] : [{ path: 'variantId', message: V.ID_INVALID }]),
  ];
  if (issues.length) throw new ValidationError(issues);
  const before = await repo.findLevel(oid(variantId), oid(branchId));
  const level = await repo.setThreshold({
    variantId: oid(variantId),
    productId: oid(variants.get(variantId).productId),
    branchId: oid(branchId),
    lowStockThreshold,
  });
  void eventBus.emit(EVENTS.STOCK_THRESHOLD_CHANGED, {
    variantId,
    branchId,
    before: before?.lowStockThreshold ?? null,
    after: lowStockThreshold,
    actorId: actor.staffId,
  });
  const [dto] = await levelDtos(actor, [level]);
  return dto;
}

// ---------------------------------------------------------------- reads

async function lookups(actor, { variantIds = [], branchIds = [], actorIds = [] }) {
  const [variants, branches, staff] = await Promise.all([
    getVariantSummaries(variantIds.map(String), { withCost: actor.can(P.PRODUCT_VIEW_COST) }),
    getBranchSummaries(branchIds.filter(Boolean).map(String)),
    getStaffNames(actorIds),
  ]);
  return { variants, branches, staff };
}

async function levelDtos(actor, levels) {
  const { variants, branches } = await lookups(actor, {
    variantIds: levels.map((l) => l.variantId),
    branchIds: levels.map((l) => l.branchId),
  });
  const fallback = fallbackThreshold();
  return levels.map((l) => {
    const threshold = l.lowStockThreshold ?? fallback;
    return {
      id: str(l._id),
      variant: variants.get(str(l.variantId)) ?? null,
      branch: branches.get(str(l.branchId)) ?? null,
      onHand: l.onHand,
      lowStockThreshold: l.lowStockThreshold ?? null,
      threshold,
      isLow: l.onHand <= threshold,
      isOut: l.onHand <= 0,
      lastMovementAt: l.lastMovementAt ?? null,
      updatedAt: l.updatedAt,
    };
  });
}

const page = (q) => ({
  sort: { [q.sort.field]: q.sort.direction },
  skip: (q.page - 1) * q.limit,
  limit: q.limit,
});
const meta = (q, total) => ({ page: q.page, limit: q.limit, total });

export async function listLevels(actor, query) {
  const and = [actor.branchFilter('branchId', query.branchId ?? null)];
  if (query.variantId) and.push({ variantId: oid(query.variantId) });
  if (query.productId) and.push({ productId: oid(query.productId) });
  if (query.q) and.push({ variantId: { $in: await matchVariantIds(query.q) } });
  if (query.low)
    and.push({
      $expr: { $lte: ['$onHand', { $ifNull: ['$lowStockThreshold', fallbackThreshold()] }] },
    });
  const { items, total } = await repo.listLevels({ $and: and }, page(query));
  return { items: await levelDtos(actor, items), meta: meta(query, total) };
}

/** One variant in every branch the actor can see (+ total). */
export async function variantLevels(actor, variantId) {
  const levels = await repo.findLevels({ variantId: oid(variantId), ...actor.branchFilter() });
  const items = await levelDtos(actor, levels);
  items.sort((a, b) => (a.branch?.code ?? '').localeCompare(b.branch?.code ?? ''));
  return { items, total: items.reduce((sum, l) => sum + l.onHand, 0) };
}

async function movementDtos(actor, movements, opsById = null) {
  const ops =
    opsById ??
    new Map(
      (await repo.findOperationsByIds([...new Set(movements.map((m) => str(m.operationId)))])).map(
        (o) => [str(o._id), o],
      ),
    );
  const { variants, branches, staff } = await lookups(actor, {
    variantIds: movements.map((m) => m.variantId),
    branchIds: movements.map((m) => m.branchId),
    actorIds: movements.map((m) => m.actorId),
  });
  const withCost = actor.can(P.PRODUCT_VIEW_COST);
  return movements.map((m) => {
    const op = ops.get(str(m.operationId));
    return {
      id: str(m._id),
      operationId: str(m.operationId),
      docNo: op?.docNo ?? null,
      reason: op?.reason ?? null,
      type: m.type,
      variant: variants.get(str(m.variantId)) ?? null,
      branch: branches.get(str(m.branchId)) ?? null,
      delta: m.delta,
      balanceAfter: m.balanceAfter,
      countedQty: m.countedQty ?? null,
      ...(withCost && { unitCost: m.unitCost ?? null }),
      actorId: str(m.actorId),
      actor: staff.get(str(m.actorId)) ?? null,
      createdAt: m.createdAt,
    };
  });
}

export async function listMovements(actor, query) {
  const filter = { ...actor.branchFilter('branchId', query.branchId ?? null) };
  if (query.variantId) filter.variantId = oid(query.variantId);
  if (query.productId) filter.productId = oid(query.productId);
  if (query.operationId) filter.operationId = oid(query.operationId);
  if (query.type) filter.type = query.type;
  if (query.from || query.to)
    filter.createdAt = {
      ...(query.from && { $gte: new Date(query.from) }),
      ...(query.to && { $lt: new Date(query.to) }),
    };
  const { items, total } = await repo.listMovements(filter, page(query));
  return { items: await movementDtos(actor, items), meta: meta(query, total) };
}

const canSeeOperation = (actor, op) =>
  actor.canAccessBranch(op.branchId) || (op.toBranchId && actor.canAccessBranch(op.toBranchId));

async function operationDtos(actor, ops) {
  const { branches, staff } = await lookups(actor, {
    branchIds: ops.flatMap((o) => [o.branchId, o.toBranchId]),
    actorIds: ops.map((o) => o.actorId),
  });
  return ops.map((o) => ({
    id: str(o._id),
    type: o.type,
    docNo: o.docNo ?? null,
    branch: branches.get(str(o.branchId)) ?? null,
    toBranch: o.toBranchId ? (branches.get(str(o.toBranchId)) ?? null) : null,
    reason: o.reason ?? null,
    note: o.note ?? '',
    reference: o.reference ?? null,
    supplierId: str(o.supplierId),
    refType: o.refType ?? null,
    refId: str(o.refId),
    lineCount: o.lineCount,
    actorId: str(o.actorId),
    actor: staff.get(str(o.actorId)) ?? null,
    createdAt: o.createdAt,
  }));
}

/** Operation header + all its ledger rows. */
async function operationDetail(actor, op, movements = null) {
  const rows = movements ?? (await repo.movementsOf(op._id));
  const [dto] = await operationDtos(actor, [op]);
  return { ...dto, movements: await movementDtos(actor, rows, new Map([[str(op._id), op]])) };
}

export async function listOperations(actor, query) {
  const and = [];
  if (query.branchId) {
    actor.assertBranch(query.branchId);
    and.push({ $or: [{ branchId: oid(query.branchId) }, { toBranchId: oid(query.branchId) }] });
  } else if (!actor.allBranches) {
    and.push({ $or: [actor.branchFilter('branchId'), actor.branchFilter('toBranchId')] });
  }
  if (query.type) and.push({ type: query.type });
  const { items, total } = await repo.listOperations(and.length ? { $and: and } : {}, page(query));
  return { items: await operationDtos(actor, items), meta: meta(query, total) };
}

export async function getOperation(actor, id) {
  const op = await repo.findOperation(id);
  if (!op || !canSeeOperation(actor, op)) throw notFound();
  return operationDetail(actor, op);
}

/** Branches the actor may pick in stock screens (no branch.view needed). */
export const branchOptions = (actor) => listBranchOptions(actor);

// ---------------------------------------------------------------- other modules

/**
 * On-hand quantities for variants in one branch (carts, POS, product pages).
 * @returns {Promise<Map<string, number>>} variantId → on hand (missing = 0)
 */
export async function getOnHand(branchId, variantIds) {
  const levels = await repo.findLevels({
    branchId: oid(branchId),
    variantId: { $in: variantIds.map(oid) },
  });
  return new Map(levels.map((l) => [str(l.variantId), l.onHand]));
}

/**
 * On hand summed over ALL branches (weighted-average costing), read in the caller's transaction.
 * @returns {Promise<Map<string, number>>}
 */
export async function getTotalOnHand(variantIds, { session } = {}) {
  const rows = await repo.sumOnHand(variantIds.map(oid), session);
  return new Map(rows.map((r) => [str(r._id), r.onHand]));
}

/**
 * Online availability (storefront): variant ids with stock in a branch that fulfils online
 * orders. In/out only — quantities are never exposed publicly.
 * @returns {Promise<Set<string>>}
 */
export async function getOnlineInStock(variantIds) {
  if (!variantIds.length) return new Set();
  const branches = await listOnlineBranchIds();
  if (!branches.length) return new Set();
  const ids = await repo.variantsInStock(variantIds.map(oid), branches);
  return new Set(ids.map(String));
}

/**
 * Quantity sellable online per variant (sum over branches that fulfil online orders). Used by
 * the cart to cap quantities; never sent to the storefront as such.
 * @returns {Promise<Map<string, number>>} missing = 0
 */
export async function getOnlineOnHand(variantIds) {
  if (!variantIds.length) return new Map();
  const branches = await listOnlineBranchIds();
  if (!branches.length) return new Map();
  const rows = await repo.sumOnHandIn(variantIds.map(oid), branches);
  return new Map(rows.map((r) => [str(r._id), r.onHand]));
}

/** Stock records in a branch (levels or operations) — such branches can't be deleted. */
export const countStockRecordsInBranch = (branchId) => repo.countBranchRecords(oid(branchId));
