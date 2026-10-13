/** Inventory module — public API. */
export { createInventoryRouter } from './inventory.routes.js';
export {
  applyStockOperation,
  countStockRecordsInBranch,
  getOnHand,
  publishStockResult,
} from './inventory.service.js';
