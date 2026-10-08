/** Products module — public API. */
export { createProductRouter } from './product.routes.js';
export {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  getProduct,
} from './product.service.js';
