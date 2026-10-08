/** Products module — public API. */
export { createProductRouter } from './product.routes.js';
export {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProduct,
  findProductBySlug,
  getIndexSources,
  getProduct,
  getPublicCards,
  iterateProducts,
  productIdBatches,
  updateProduct,
} from './product.service.js';
