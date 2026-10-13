import { ERROR_CODES, EVENTS } from '@supershop/shared';
import { AppError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey, nameTakenError } from '../../core/slug.js';
import * as repo from './supplier.repo.js';

/** Suppliers (P1.3): who the shop buys from. Used by products (P1.4) and purchase orders (P2.3). */

/** Products/purchase orders referencing a supplier — injected at the composition root. */
let countSupplierUsage = async () => 0;
export function setSupplierUsageCounter(fn) {
  countSupplierUsage = fn;
}

const notFound = () => new NotFoundError('Supplier not found');
const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });
/** Audit keeps business fields only (no contact person/phone/email). */
const auditView = (s) => ({
  name: s.name,
  isActive: s.isActive,
  paymentTermsDays: s.paymentTermsDays,
  taxNumber: s.taxNumber ?? null,
});

export const toSupplierDto = (s) => ({
  id: String(s._id),
  name: s.name,
  contactName: s.contactName ?? null,
  phone: s.phone ?? null,
  email: s.email ?? null,
  address: s.address ?? null,
  taxNumber: s.taxNumber ?? null,
  registrationNumber: s.registrationNumber ?? null,
  paymentTermsDays: s.paymentTermsDays ?? 0,
  notes: s.notes ?? '',
  isActive: s.isActive,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

export async function listSuppliers(query) {
  const { items, total } = await repo.listActive(query);
  return { items: items.map(toSupplierDto), meta: { page: query.page, limit: query.limit, total } };
}

export async function getSupplier(id) {
  const s = await repo.findActiveById(id);
  if (!s) throw notFound();
  return toSupplierDto(s);
}

/** For other modules (products, purchase orders). Missing/deleted ids omitted. */
export const getSuppliersByIds = async (ids) =>
  (await repo.findActiveByIds(ids)).map(toSupplierDto);

export async function createSupplier(actor, input) {
  if (await repo.nameExists(input.name)) throw nameTakenError();
  let created;
  try {
    created = await repo.createSupplier({
      isActive: true,
      paymentTermsDays: 0,
      notes: '',
      ...input,
    });
  } catch (err) {
    throw isDuplicateKey(err, 'nameKey') ? nameTakenError() : err;
  }
  emit(actor, EVENTS.SUPPLIER_CREATED, {
    supplierId: String(created._id),
    after: auditView(created),
  });
  return toSupplierDto(created);
}

export async function updateSupplier(actor, id, input) {
  const before = await repo.findActiveById(id);
  if (!before) throw notFound();
  if (input.name !== undefined && (await repo.nameExists(input.name, id))) throw nameTakenError();
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  let saved;
  try {
    saved = await repo.updateSupplier(id, patch);
  } catch (err) {
    throw isDuplicateKey(err, 'nameKey') ? nameTakenError() : err;
  }
  if (!saved) throw notFound();
  emit(actor, EVENTS.SUPPLIER_UPDATED, {
    supplierId: id,
    before: auditView(before),
    after: auditView(saved),
  });
  return toSupplierDto(saved);
}

/** Soft delete; refused while products or purchase orders reference the supplier. */
export async function deleteSupplier(actor, id) {
  if (!(await repo.findActiveById(id))) throw notFound();
  if ((await countSupplierUsage(id)) > 0) {
    throw new AppError(ERROR_CODES.SUPPLIER_IN_USE, 'Supplier is in use', { status: 409 });
  }
  if (!(await repo.softDelete(id))) throw notFound();
  emit(actor, EVENTS.SUPPLIER_DELETED, { supplierId: id });
}

/** `[{ id, name }]` of all suppliers (imports resolve supplier names). */
export const listAllSuppliers = async () =>
  (await repo.listAllActive()).map((x) => ({ id: String(x._id), name: x.name }));
