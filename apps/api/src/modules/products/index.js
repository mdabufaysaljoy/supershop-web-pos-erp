/** Products module — public API. */
export { createProductRouter } from './product.routes.js';
export {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProduct,
  findProductBySlug,
  getProduct,
  iterateProducts,
  updateProduct,
} from './product.service.js';
