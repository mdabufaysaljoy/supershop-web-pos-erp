import { PurchaseOrder } from './purchaseOrder.model.js';

const opts = (session) => (session ? { session } : {});
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createOrder = (data) => PurchaseOrder.create(data).then((d) => d.toObject());
export const findById = (id) => PurchaseOrder.findById(id).lean();
/** Mongoose document for an update, read in the transaction when `session` is given. */
export const loadForUpdate = (id, session) => PurchaseOrder.findById(id, null, opts(session));
export const saveDoc = (doc, session) => doc.save(opts(session)).then((d) => d.toObject());

export async function listOrders(
  { scope, status, supplierId, branchId, q },
  { sort, skip, limit },
) {
  const and = [scope];
  if (status) and.push({ status });
  if (supplierId) and.push({ supplierId });
  if (branchId) and.push({ branchId });
  if (q) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    and.push({ $or: [{ poNo: rx }, { reference: rx }, { supplierName: rx }] });
  }
  const filter = { $and: and };
  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter, { receipts: 0 })
      .sort({ ...sort, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PurchaseOrder.countDocuments(filter),
  ]);
  return { items, total };
}

export const countBySupplier = (supplierId) => PurchaseOrder.countDocuments({ supplierId });
export const countByBranch = (branchId) => PurchaseOrder.countDocuments({ branchId });
