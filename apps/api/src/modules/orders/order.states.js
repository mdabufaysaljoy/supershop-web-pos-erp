import {
  ACTORS,
  allowedTransitions,
  ERROR_CODES,
  EVENTS,
  findTransition,
  transitionByAction,
} from '@supershop/shared';
import mongoose from 'mongoose';
import { AppError, ConflictError, NotFoundError } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { eventBus } from '../../core/events.js';
import { applyStockOperation, publishStockResult, reversalLinesFor } from '../inventory/index.js';
import * as repo from './order.repo.js';

/**
 * Moving an order through its life (P4.3). The WAY an order may move lives in the shared config
 * (`ORDER_FLOW`); this file knows how to check the named guards — which need payments, shipments
 * and stock — and how to carry the move out.
 *
 * Every move is one transaction: status, history, and (for a cancellation) the goods going back on
 * the shelf. Events are emitted after it commits (D-013).
 */
const str = (id) => (id == null ? null : String(id));

const conflict = (code, message) => new AppError(code, message, { status: 409 });

/**
 * Named guards from the config. Each answers "may this order move?" with a reason the shop can act
 * on — never a bare false.
 * @type {Record<string, (order: object, input: object) => string | null>} null = allowed
 */
const GUARDS = {
  /** The money is actually in (the payments module says so). */
  paymentSettled: (order) =>
    order.payment?.status === 'paid' ? null : 'The payment has not settled yet',
  methodIsCod: (order) =>
    (order.payment?.methodType ?? order.payment?.method) === 'cod'
      ? null
      : 'Only a cash-on-delivery order can be confirmed this way',
  /** Something must actually be on its way. */
  hasShipment: (order) =>
    order.shipments?.length ? null : 'Add the shipment (carrier and tracking number) first',
  /**
   * Money first: an order that was paid may not simply be cancelled — refund it, then cancel.
   * Cash on delivery has nothing to return, so it cancels freely.
   */
  moneyReturned: (order) =>
    order.payment?.status === 'paid' ? 'Refund the payment before cancelling this order' : null,
};

/** What this order can do next, for the admin's buttons (P4.4) and for tests. */
export const nextActions = (order, by = ACTORS.STAFF) =>
  allowedTransitions(order.status, { by }).map((t) => ({
    ...t,
    blockedBy: (t.guards ?? []).map((g) => GUARDS[g]?.(order)).find(Boolean) ?? null,
  }));

/** Puts back exactly what the order's sale operations took, in the same transaction. */
async function restock(order, session, actorId) {
  const operationIds = (order.fulfillment ?? []).map((f) => f.operationId).filter(Boolean);
  if (!operationIds.length) return [];
  const perBranch = await reversalLinesFor(operationIds, { session });
  const results = [];
  for (const part of perBranch) {
    results.push(
      await applyStockOperation(
        {
          type: 'return',
          branchId: part.branchId,
          lines: part.lines,
          ref: { type: 'order', id: str(order._id) },
          reason: 'order_cancelled',
          note: `Cancelled ${order.orderNo}`,
        },
        { session, actorId },
      ),
    );
  }
  return results;
}

/**
 * Moves an order to `to`, or refuses with the reason. The only way an order's status changes.
 * @param {string} orderId
 * @param {string} to
 * @param {{ actor?: object, by?: string, reason?: string, note?: string }} [opts]
 *   `by` is 'staff' (an action in the admin) or 'system' (a gateway, a job).
 */
export async function moveOrder(
  orderId,
  to,
  { actor = null, by = ACTORS.STAFF, reason = null } = {},
) {
  const current = await repo.findById(orderId);
  if (!current) throw new NotFoundError('Order not found');
  if (current.status === to) return { order: current, changed: false };

  const transition = findTransition(current.status, to);
  if (!transition)
    throw conflict(
      ERROR_CODES.INVALID_STATE_TRANSITION,
      `An order that is ${current.status} cannot become ${to}`,
    );
  if (!transition.by.includes(by))
    throw conflict(ERROR_CODES.INVALID_STATE_TRANSITION, 'That change is not yours to make');

  for (const guard of transition.guards ?? []) {
    const blocked = GUARDS[guard]?.(current);
    if (blocked) throw conflict(ERROR_CODES.INVALID_STATE_TRANSITION, blocked);
  }

  const actorId = actor?.staffId ? new mongoose.Types.ObjectId(String(actor.staffId)) : null;
  const { order, stock } = await withTransaction(async (session) => {
    // The guard ran against a snapshot: re-read inside the transaction so two staff racing on the
    // same order cannot both move it.
    const fresh = await repo.findById(orderId, session);
    if (!fresh || fresh.status !== current.status)
      throw new ConflictError('This order changed meanwhile, please look again');

    const movements = transition.restock ? await restock(fresh, session, str(actorId)) : [];
    const updated = await repo.applyTransition(
      orderId,
      current.status,
      {
        status: to,
        ...(to === 'cancelled' && { cancelledAt: new Date(), cancelReason: reason ?? null }),
      },
      {
        at: new Date(),
        from: current.status,
        to,
        action: transition.action,
        by,
        staffId: actorId,
        reason: reason ?? null,
        restocked: movements.length > 0,
      },
      session,
    );
    if (!updated) throw new ConflictError('This order changed meanwhile, please look again');
    return { order: updated, stock: movements };
  });

  stock.forEach(publishStockResult);
  void eventBus.emit(transition.event, {
    orderId: str(order._id),
    orderNo: order.orderNo,
    from: current.status,
    to,
    action: transition.action,
    by,
    reason: reason ?? null,
    restocked: stock.length > 0,
    total: order.totals.total,
    customerId: str(order.customer.customerId),
    lang: order.lang,
  });
  if (transition.event !== EVENTS.ORDER_STATUS_CHANGED)
    void eventBus.emit(EVENTS.ORDER_STATUS_CHANGED, {
      orderId: str(order._id),
      orderNo: order.orderNo,
      from: current.status,
      to,
    });
  return { order, changed: true };
}

/** `moveOrder` by the name the flow gives the move ('ship', 'cancel'…). */
export async function runAction(orderId, action, opts = {}) {
  const current = await repo.findById(orderId);
  if (!current) throw new NotFoundError('Order not found');
  const transition = transitionByAction(current.status, action);
  if (!transition)
    throw conflict(
      ERROR_CODES.INVALID_STATE_TRANSITION,
      `An order that is ${current.status} cannot ${action}`,
    );
  return moveOrder(orderId, transition.to, opts);
}

/**
 * Records a shipment and, when the order is ready for it, moves it to `shipped` in the same breath
 * — adding the tracking number IS shipping it, as far as the shop is concerned.
 * @param {{ carrier: string, trackingNumber?: string, trackingUrl?: string, shippedAt?: string }} input
 */
export async function addShipment(orderId, input, { actor = null } = {}) {
  const order = await repo.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (!['paid', 'cod_confirmed', 'processing', 'shipped'].includes(order.status))
    throw conflict(
      ERROR_CODES.INVALID_STATE_TRANSITION,
      `An order that is ${order.status} cannot be shipped`,
    );

  const updated = await repo.addShipment(orderId, {
    carrier: input.carrier,
    trackingNumber: input.trackingNumber ?? null,
    trackingUrl: input.trackingUrl ?? null,
    shippedAt: input.shippedAt ? new Date(input.shippedAt) : new Date(),
    staffId: actor?.staffId ? new mongoose.Types.ObjectId(String(actor.staffId)) : null,
  });
  void eventBus.emit(EVENTS.SHIPMENT_CREATED, {
    orderId: str(updated._id),
    orderNo: updated.orderNo,
    carrier: input.carrier,
    trackingNumber: input.trackingNumber ?? null,
  });

  if (updated.status === 'processing')
    return (await moveOrder(orderId, 'shipped', { actor })).order;
  return updated;
}
