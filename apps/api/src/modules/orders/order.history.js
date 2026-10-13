import { toOrderDto } from './order.service.js';
import * as repo from './order.repo.js';
import { NotFoundError } from '../../core/errors.js';

/**
 * Order history for the signed-in customer (P3.5). Only orders already linked to their id are
 * visible; linking happens when they place an order while signed in, or when they prove the email
 * (verification / Google sign-in) — see `linkOrdersToCustomer`.
 */

/** List row: enough for the history page without shipping every snapshot field. */
const toHistoryRow = (o) => ({
  id: String(o._id),
  orderNo: o.orderNo,
  status: o.status,
  placedAt: o.placedAt,
  itemCount: o.totals.itemCount,
  total: o.totals.total,
  currency: o.currency,
  payment: { method: o.payment.method, status: o.payment.status },
  items: o.items.slice(0, 3).map((i) => ({ name: i.name, image: i.imageUrl ?? null, qty: i.qty })),
});

/** @param {{ page: number, limit: number }} query validated */
export async function listCustomerOrders(customerId, { page, limit }) {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    repo.listByCustomer(customerId, { skip, limit }),
    repo.countByCustomer(customerId),
  ]);
  return { data: orders.map(toHistoryRow), meta: { page, limit, total } };
}

export async function getCustomerOrder(customerId, id) {
  const order = await repo.findByIdForCustomer(id, customerId);
  if (!order) throw new NotFoundError('Order not found');
  return toOrderDto(order);
}

/** Called when an email becomes proven for a customer; returns how many orders were adopted. */
export const linkOrdersToCustomer = (email, customerId) =>
  email ? repo.linkGuestOrdersByEmail(String(email).toLowerCase(), customerId) : Promise.resolve(0);
