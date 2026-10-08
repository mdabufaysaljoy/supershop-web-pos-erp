/** Categories module — public API. */
export { createCategoryRouter } from './category.routes.js';
export {
  getCategoriesByIds,
  getCategory,
  listCategories,
  setCategoryUsageCounter,
} from './category.service.js';
