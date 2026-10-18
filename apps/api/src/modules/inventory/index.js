/** Inventory module — public API. */
export { createInventoryRouter } from './inventory.routes.js';
export {
  applyStockOperation,
  countStockRecordsInBranch,
  findOperationByIdempotencyKey,
  getOnHand,
  getOnlineInStock,
  getOnlineOnHand,
  getOnlineStockByBranch,
  getTotalOnHand,
  getInventoryHealth,
  publishStockResult,
  reversalLinesFor,
} from './inventory.service.js';
