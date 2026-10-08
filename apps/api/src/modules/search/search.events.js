import { EVENTS } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { reindexWhere, scheduleReindex } from './search.service.js';

/**
 * Keeps the search index in sync (CLAUDE.md §2.2: side effects as subscribers):
 * - product created/updated/deleted/price changed → that product;
 * - Arabic text arrives (translation job done) for a product → that product;
 * - category renamed/moved/translated or brand renamed → the products under it.
 */
const safely = (fn) => async (event) => {
  try {
    await fn(event.payload ?? {});
  } catch (err) {
    logger.error({ err: { message: err.message }, event: event.name }, 'search sync failed');
  }
};

let registered = false;
export function registerSearchSubscribers() {
  if (registered) return;
  registered = true;
  for (const name of [
    EVENTS.PRODUCT_CREATED,
    EVENTS.PRODUCT_UPDATED,
    EVENTS.PRODUCT_DELETED,
    EVENTS.PRODUCT_PRICE_CHANGED,
  ]) {
    eventBus.on(
      name,
      safely(({ productId }) => productId && scheduleReindex([productId])),
    );
  }
  eventBus.on(
    EVENTS.TRANSLATION_COMPLETED,
    safely(async ({ model, id }) => {
      if (model === 'Product') await scheduleReindex([id]);
      else if (model === 'Category') await reindexWhere({ categoryId: id });
    }),
  );
  for (const name of [EVENTS.CATEGORY_UPDATED, EVENTS.CATEGORY_MOVED]) {
    eventBus.on(
      name,
      safely(({ categoryId }) => reindexWhere({ categoryId })),
    );
  }
  eventBus.on(
    EVENTS.BRAND_UPDATED,
    safely(({ brandId }) => reindexWhere({ brandId })),
  );
}
