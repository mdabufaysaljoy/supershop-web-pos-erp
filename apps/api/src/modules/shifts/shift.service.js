import {
  ERROR_CODES,
  EVENTS,
  PERMISSIONS as P,
  previewLines,
  renderShiftReport,
  SHIFT,
  summarizeShift,
} from '@supershop/shared';
import mongoose from 'mongoose';
import { formatSequence, nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import { getSetting } from '../settings/index.js';
import * as repo from './shift.repo.js';

/**
 * Cashier shifts, cash movements, X-Report & Z-Report service (P6.5).
 */
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));

let providers = {
  getStaffNames: async () => new Map(),
  getBranchSummaries: async () => new Map(),
  listOrdersForShift: async () => [],
  getShop: async () => ({ name: getSetting('store.name'), vatNumber: getSetting('tax.vatNumber') }),
  buildShiftReportJob: null,
  buildDrawerKickJob: null,
};

export function setShiftProviders(next) {
  providers = { ...providers, ...next };
}

const shiftNotOpen = (msg = 'This shift is not open') =>
  new AppError(ERROR_CODES.SHIFT_NOT_OPEN, msg, { status: 409 });

/** A branch manager (or HQ / super-admin) can close another cashier's shift or approve a discrepancy. */
const isShiftManager = (actor) =>
  Boolean(
    actor?.isSuperAdmin ||
    actor?.allBranches ||
    actor?.can(P.SHIFT_CASH_MOVEMENT) ||
    actor?.can(P.STAFF_MANAGE),
  );

function assertCanAccessShift(actor, shift) {
  actor.assertBranch(str(shift.branchId));
  if (
    !actor.can(P.SHIFT_VIEW) &&
    !isShiftManager(actor) &&
    str(shift.openedBy) !== str(actor.staffId)
  ) {
    throw new ForbiddenError('You can only view your own shift');
  }
}

async function staffNameFor(staffId) {
  if (!staffId) return 'Staff';
  const map = await providers.getStaffNames([String(staffId)]);
  return map.get(String(staffId))?.name ?? 'Staff';
}

async function branchNameFor(branchId) {
  if (!branchId) return '';
  const map = await providers.getBranchSummaries([String(branchId)]);
  const b = map.get(String(branchId));
  return b?.name?.en ?? b?.code ?? '';
}

const toMovementDto = (m) => ({
  id: str(m._id),
  type: m.type,
  amount: m.amount,
  reason: m.reason,
  at: m.at,
  staffId: str(m.staffId),
  staffName: m.staffName,
});

export function toShiftDto(shift, { summary = null, branchName = '' } = {}) {
  return {
    id: str(shift._id),
    shiftNo: shift.shiftNo,
    branchId: str(shift.branchId),
    branchName: branchName || shift.branchName || '',
    status: shift.status,
    openedBy: str(shift.openedBy),
    openedByName: shift.openedByName,
    openedAt: shift.openedAt,
    openingCash: shift.openingCash,
    openNote: shift.openNote ?? '',
    movements: (shift.movements ?? []).map(toMovementDto),
    closedBy: str(shift.closedBy),
    closedByName: shift.closedByName ?? null,
    closedAt: shift.closedAt ?? null,
    closingCash: shift.closingCash ?? null,
    expectedCash: shift.expectedCash ?? summary?.expectedCash ?? null,
    discrepancy: shift.discrepancy ?? summary?.discrepancy ?? null,
    closeNote: shift.closeNote ?? '',
    zReportId: str(shift.zReportId),
    zReportNo: shift.zReportNo ?? null,
    ...(summary ? { summary } : {}),
  };
}

export function toZReportDto(z, { branchName = '', lines = [] } = {}) {
  return {
    id: str(z._id),
    zReportNo: z.zReportNo,
    shiftId: str(z.shiftId),
    shiftNo: z.shiftNo,
    branchId: str(z.branchId),
    branchName,
    openedBy: str(z.openedBy),
    openedByName: z.openedByName,
    closedBy: str(z.closedBy),
    closedByName: z.closedByName,
    openedAt: z.openedAt,
    closedAt: z.closedAt,
    openingCash: z.openingCash,
    closingCash: z.closingCash,
    expectedCash: z.expectedCash,
    discrepancy: z.discrepancy,
    cashSales: z.cashSales,
    cashIn: z.cashIn,
    cashOut: z.cashOut,
    netCashMovements: z.netCashMovements,
    sales: z.sales,
    byMethod: z.byMethod ?? [],
    movements: (z.movements ?? []).map(toMovementDto),
    closeNote: z.closeNote ?? '',
    currency: z.currency ?? getSetting('store.currency'),
    lines,
  };
}

async function computeShiftSummary(shift, { closingCash = shift.closingCash, session } = {}) {
  const orders = await providers.listOrdersForShift(shift._id, session);
  return summarizeShift({
    openingCash: shift.openingCash,
    closingCash,
    movements: shift.movements ?? [],
    orders,
  });
}

async function renderReportLines(shift, summary, kind) {
  const [branchName, shop] = await Promise.all([
    branchNameFor(shift.branchId),
    providers.getShop('en'),
  ]);
  const bytes = renderShiftReport(
    { ...shift, branchName, summary },
    {
      kind,
      widthMm: 80,
      shop,
      currency: getSetting('store.currency'),
      lang: 'en',
      timeZone: getSetting('store.timeZone'),
    },
  );
  return { branchName, lines: previewLines(bytes) };
}

/**
 * Used by `createPosSale` to attach an open shift (or enforce `pos.requireOpenShift`).
 */
export async function resolveOpenShiftForSale({ branchId, staffId }) {
  const own = staffId ? await repo.findOpenByStaff(oid(staffId), oid(branchId)) : null;
  const shift = own ?? (await repo.findOpenInBranch(oid(branchId)));
  return shift ? { id: str(shift._id), shiftNo: shift.shiftNo } : null;
}

/**
 * Current open shift in a branch for the acting staff member (or any open shift in the branch for
 * a manager/viewer).
 */
export async function getCurrentShift(actor, { branchId }) {
  actor.assertBranch(branchId);
  const own = actor.staffId ? await repo.findOpenByStaff(oid(actor.staffId), oid(branchId)) : null;
  const shift =
    own ??
    (actor.can(P.SHIFT_VIEW) || isShiftManager(actor)
      ? await repo.findOpenInBranch(oid(branchId))
      : null);
  if (!shift) return null;
  const [summary, branchName] = await Promise.all([
    computeShiftSummary(shift),
    branchNameFor(shift.branchId),
  ]);
  return toShiftDto(shift, { summary, branchName });
}

/**
 * Opens a new cashier shift with an opening cash count.
 */
export async function openShift(actor, { branchId, openingCash, note = '' }) {
  actor.assertBranch(branchId);
  await repo.initCollections();

  const existing = await repo.findOpenByStaff(oid(actor.staffId));
  if (existing) {
    throw new ConflictError('You already have an open shift', {
      shiftId: str(existing._id),
      shiftNo: existing.shiftNo,
    });
  }

  const [openedByName, branchName] = await Promise.all([
    staffNameFor(actor.staffId),
    branchNameFor(branchId),
  ]);
  const openedAt = new Date();

  let created;
  try {
    created = await withTransaction(async (session) => {
      const shiftNo = formatSequence(await nextSequence('shift', { session }), {
        prefix: SHIFT.NUMBER_PREFIX,
        pad: 6,
      });
      return repo.insertShift(
        {
          shiftNo,
          branchId: oid(branchId),
          status: 'open',
          openedBy: oid(actor.staffId),
          openedByName,
          openedAt,
          openingCash,
          openNote: note ?? '',
          movements: [],
        },
        session,
      );
    });
  } catch (err) {
    if (isDuplicateKey(err, 'openedBy')) {
      throw new ConflictError('You already have an open shift');
    }
    throw err;
  }

  const summary = summarizeShift({ openingCash, movements: [], orders: [] });
  void eventBus.emit(EVENTS.SHIFT_OPENED, {
    shiftId: str(created._id),
    shiftNo: created.shiftNo,
    branchId: str(created.branchId),
    openingCash: created.openingCash,
    actorId: actor.staffId,
  });

  return toShiftDto(created, { summary, branchName });
}

/**
 * Records a paid-in or paid-out cash movement on an open shift (`shift.cashMovement`).
 */
export async function recordCashMovement(actor, shiftId, { type, amount, reason }) {
  const shift = await repo.findById(shiftId);
  if (!shift) throw new NotFoundError('Shift not found');
  actor.assertBranch(str(shift.branchId));
  if (shift.status !== 'open') throw shiftNotOpen();
  if ((shift.movements?.length ?? 0) >= SHIFT.MAX_MOVEMENTS) {
    throw new ConflictError('Maximum cash movements reached for this shift');
  }

  const currentSummary = await computeShiftSummary(shift);
  if (type === 'out' && amount > currentSummary.expectedCash) {
    throw new ConflictError('Cash out exceeds expected cash in drawer', {
      expectedCash: currentSummary.expectedCash,
      requested: amount,
    });
  }

  const staffName = await staffNameFor(actor.staffId);
  const updated = await repo.appendMovement(shiftId, {
    type,
    amount,
    reason,
    at: new Date(),
    staffId: oid(actor.staffId),
    staffName,
  });
  if (!updated) throw shiftNotOpen();

  const [summary, branchName] = await Promise.all([
    computeShiftSummary(updated),
    branchNameFor(updated.branchId),
  ]);

  void eventBus.emit(EVENTS.SHIFT_CASH_MOVED, {
    shiftId: str(updated._id),
    shiftNo: updated.shiftNo,
    branchId: str(updated.branchId),
    type,
    amount,
    reason,
    expectedCash: summary.expectedCash,
    actorId: actor.staffId,
  });

  return toShiftDto(updated, { summary, branchName });
}

/**
 * Closes an open shift with a counted cash amount and writes an immutable Z-Report in one
 * transaction. Enforces role-based shift rules (own-shift rule and `pos.shiftMaxDiscrepancy`).
 */
export async function closeShift(actor, shiftId, { closingCash, note = '' }) {
  await repo.initCollections();
  const shift = await repo.findById(shiftId);
  if (!shift) throw new NotFoundError('Shift not found');
  actor.assertBranch(str(shift.branchId));
  if (shift.status !== 'open') throw shiftNotOpen('This shift is already closed');

  // Role-based rule 1: a cashier without manager permissions can only close their own shift.
  if (str(shift.openedBy) !== str(actor.staffId) && !isShiftManager(actor)) {
    throw new ForbiddenError('You can only close your own shift');
  }

  const preSummary = await computeShiftSummary(shift, { closingCash });
  const maxDiscrepancy = getSetting('pos.shiftMaxDiscrepancy');
  // Role-based rule 2: if a discrepancy ceiling is configured, exceeding it requires a manager.
  if (
    maxDiscrepancy > 0 &&
    Math.abs(preSummary.discrepancy ?? 0) > maxDiscrepancy &&
    !isShiftManager(actor)
  ) {
    throw new ForbiddenError(
      'Cash discrepancy exceeds the allowed limit; a manager must close this shift',
    );
  }

  const closedByName = await staffNameFor(actor.staffId);
  const closedAt = new Date();
  const currency = getSetting('store.currency');

  const { closedShift, zReport, summary } = await withTransaction(async (session) => {
    const fresh = await repo.findById(shiftId, session);
    if (!fresh || fresh.status !== 'open') throw shiftNotOpen('This shift is already closed');
    const finalSummary = await computeShiftSummary(fresh, { closingCash, session });
    const zReportNo = formatSequence(await nextSequence('zReport', { session }), {
      prefix: SHIFT.Z_REPORT_PREFIX,
      pad: 6,
    });
    const zDoc = await repo.insertZReport(
      {
        zReportNo,
        shiftId: fresh._id,
        shiftNo: fresh.shiftNo,
        branchId: fresh.branchId,
        openedBy: fresh.openedBy,
        openedByName: fresh.openedByName,
        closedBy: oid(actor.staffId),
        closedByName,
        openedAt: fresh.openedAt,
        closedAt,
        openingCash: finalSummary.openingCash,
        closingCash: finalSummary.closingCash,
        expectedCash: finalSummary.expectedCash,
        discrepancy: finalSummary.discrepancy,
        cashSales: finalSummary.cashSales,
        cashIn: finalSummary.cashIn,
        cashOut: finalSummary.cashOut,
        netCashMovements: finalSummary.netCashMovements,
        sales: finalSummary.sales,
        byMethod: finalSummary.byMethod,
        movements: fresh.movements ?? [],
        closeNote: note ?? '',
        currency,
      },
      session,
    );
    const updatedShift = await repo.closeShiftDoc(
      shiftId,
      {
        closedBy: oid(actor.staffId),
        closedByName,
        closedAt,
        closingCash: finalSummary.closingCash,
        expectedCash: finalSummary.expectedCash,
        discrepancy: finalSummary.discrepancy,
        closeNote: note ?? '',
        zReportId: zDoc._id,
        zReportNo,
      },
      session,
    );
    if (!updatedShift) throw shiftNotOpen('This shift is already closed');
    return { closedShift: updatedShift, zReport: zDoc, summary: finalSummary };
  });

  const { branchName, lines } = await renderReportLines(closedShift, summary, 'z');

  void eventBus.emit(EVENTS.SHIFT_CLOSED, {
    shiftId: str(closedShift._id),
    shiftNo: closedShift.shiftNo,
    zReportId: str(zReport._id),
    zReportNo: zReport.zReportNo,
    branchId: str(closedShift.branchId),
    openingCash: closedShift.openingCash,
    closingCash: closedShift.closingCash,
    expectedCash: closedShift.expectedCash,
    discrepancy: closedShift.discrepancy,
    actorId: actor.staffId,
  });

  return {
    shift: toShiftDto(closedShift, { summary, branchName }),
    zReport: toZReportDto(zReport, { branchName, lines }),
  };
}

/**
 * Shift detail (with live summary if open, or stored Z-report summary if closed).
 */
export async function getShift(actor, shiftId) {
  const shift = await repo.findById(shiftId);
  if (!shift) throw new NotFoundError('Shift not found');
  assertCanAccessShift(actor, shift);
  const [summary, branchName] = await Promise.all([
    computeShiftSummary(shift),
    branchNameFor(shift.branchId),
  ]);
  return toShiftDto(shift, { summary, branchName });
}

/**
 * X-Report: live mid-shift reading (does not close the shift).
 */
export async function getXReport(actor, shiftId) {
  const shift = await repo.findById(shiftId);
  if (!shift) throw new NotFoundError('Shift not found');
  assertCanAccessShift(actor, shift);
  const summary = await computeShiftSummary(shift);
  const { branchName, lines } = await renderReportLines(shift, summary, 'x');
  return {
    kind: 'x',
    shift: toShiftDto(shift, { summary, branchName }),
    summary,
    lines,
    generatedAt: new Date(),
  };
}

/**
 * Z-Report: immutable end-of-shift report created when the shift was closed.
 */
export async function getZReport(actor, shiftId) {
  const shift = await repo.findById(shiftId);
  if (!shift) throw new NotFoundError('Shift not found');
  assertCanAccessShift(actor, shift);
  const z = await repo.findZReportByShiftId(shift._id);
  if (!z) throw new NotFoundError('Z-Report not found (shift is still open)');
  const summary = {
    openingCash: z.openingCash,
    closingCash: z.closingCash,
    expectedCash: z.expectedCash,
    discrepancy: z.discrepancy,
    cashSales: z.cashSales,
    cashIn: z.cashIn,
    cashOut: z.cashOut,
    netCashMovements: z.netCashMovements,
    movementCount: z.movements?.length ?? 0,
    sales: z.sales,
    byMethod: z.byMethod ?? [],
  };
  const { branchName, lines } = await renderReportLines(shift, summary, 'z');
  return toZReportDto(z, { branchName, lines });
}

/**
 * Builds a thermal ESC/POS print job for a shift's X-Report or Z-Report.
 */
export async function printShiftReport(actor, shiftId, { kind, profileId } = {}) {
  const shift = await repo.findById(shiftId);
  if (!shift) throw new NotFoundError('Shift not found');
  assertCanAccessShift(actor, shift);

  const reportKind = kind ?? (shift.status === 'closed' ? 'z' : 'x');
  if (reportKind === 'z' && shift.status !== 'closed') {
    throw shiftNotOpen('Close the shift before printing its Z-Report');
  }

  const [summary, branchName] = await Promise.all([
    computeShiftSummary(shift),
    branchNameFor(shift.branchId),
  ]);
  return providers.buildShiftReportJob(
    { ...shift, branchName, summary },
    { kind: reportKind, profileId, branchId: str(shift.branchId) },
  );
}

/**
 * Kicks the cash drawer on the branch's receipt printer (`ESC p`).
 */
export async function kickCashDrawer(actor, { branchId, profileId }) {
  actor.assertBranch(branchId);
  return providers.buildDrawerKickJob({ branchId, profileId });
}

/**
 * Lists shifts in the actor's branch scope (cashiers without `shift.view` see only their own).
 */
export async function listShifts(actor, { page, limit, sort, branchId, status, staffId }) {
  if (branchId) actor.assertBranch(branchId);
  const filter = {
    ...actor.branchFilter('branchId'),
    ...(branchId && { branchId: oid(branchId) }),
    ...(status && { status }),
    ...(staffId && { openedBy: oid(staffId) }),
  };
  if (!actor.can(P.SHIFT_VIEW) && !isShiftManager(actor)) {
    filter.openedBy = oid(actor.staffId);
  }
  const { items, total } = await repo.listShifts(filter, {
    sort: { [sort.field]: sort.direction, _id: -1 },
    skip: (page - 1) * limit,
    limit,
  });
  const branchIds = [...new Set(items.map((s) => str(s.branchId)).filter(Boolean))];
  const branches = branchIds.length ? await providers.getBranchSummaries(branchIds) : new Map();

  const data = await Promise.all(
    items.map(async (s) => {
      const b = branches.get(str(s.branchId));
      const branchName = b?.name?.en ?? b?.code ?? '';
      const summary = s.status === 'open' ? await computeShiftSummary(s) : null;
      return toShiftDto(s, { summary, branchName });
    }),
  );

  return { data, meta: { page, limit, total } };
}

export const countShiftsInBranch = (branchId) => repo.countInBranch(branchId);
