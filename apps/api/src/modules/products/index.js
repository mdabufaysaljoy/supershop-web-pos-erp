/** Products module — public API. */
export { createProductRouter } from './product.routes.js';
export {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProduct,
  findProductBySlug,
  findStockableVariants,
  getIndexSources,
  getProduct,
  getPublicCards,
  getVariantSummaries,
  iterateProducts,
  matchVariantIds,
  productIdBatches,
  updateProduct,
} from './product.service.js';
