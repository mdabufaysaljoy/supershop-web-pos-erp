/** Products module — public API. */
export { createProductRouter } from './product.routes.js';
export {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProduct,
  findProductBySlug,
  findStockableVariants,
  getCartVariants,
  getIndexSources,
  getProduct,
  getVariantCosts,
  getPublicCards,
  getVariantSummaries,
  iterateProducts,
  matchVariantIds,
  productIdBatches,
  publishCostChanges,
  setAvailabilityProvider,
  setVariantCosts,
  updateProduct,
} from './product.service.js';
