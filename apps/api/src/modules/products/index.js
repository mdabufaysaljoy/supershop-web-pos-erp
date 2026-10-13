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
  getVariantCosts,
  getPublicCards,
  getVariantSummaries,
  iterateProducts,
  matchVariantIds,
  productIdBatches,
  publishCostChanges,
  setVariantCosts,
  updateProduct,
} from './product.service.js';
