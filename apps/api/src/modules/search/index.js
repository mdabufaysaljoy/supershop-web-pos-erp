/** Product search module — public API. */
export { createSearchRouter } from './search.routes.js';
export { registerSearchSubscribers } from './search.events.js';
export {
  ensureSearchIndex,
  rebuildIndex,
  reindexProducts,
  searchProducts,
} from './search.service.js';
