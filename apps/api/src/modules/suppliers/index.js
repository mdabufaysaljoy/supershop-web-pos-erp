/** Suppliers module — public API. */
export { createSupplierRouter } from './supplier.routes.js';
export {
  getSupplier,
  getSuppliersByIds,
  listAllSuppliers,
  setSupplierUsageCounter,
} from './supplier.service.js';
