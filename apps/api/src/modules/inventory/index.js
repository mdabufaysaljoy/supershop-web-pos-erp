/** Inventory module — public API. */
export { createInventoryRouter } from './inventory.routes.js';
export {
  applyStockOperation,
  countStockRecordsInBranch,
  findOperationByIdempotencyKey,
  getOnHand,
  getOnlineInStock,
  getTotalOnHand,
  publishStockResult,
} from './inventory.service.js';
