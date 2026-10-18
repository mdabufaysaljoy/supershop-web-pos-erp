import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './db.js';
import { logger } from './logger.js';

/**
 * List of all model module paths across the application.
 */
const MODEL_MODULES = [
  '../modules/customers/customer.model.js',
  '../modules/settings/settings.model.js',
  '../modules/rbac/role.model.js',
  '../modules/payments/payment.model.js',
  '../modules/products/product.model.js',
  '../modules/suppliers/supplier.model.js',
  '../modules/productTransfer/transfer.model.js',
  '../modules/purchasing/purchaseOrder.model.js',
  '../modules/auth/auth.model.js',
  '../modules/brands/brand.model.js',
  '../modules/printing/printer.model.js',
  '../modules/paymentMethods/paymentMethod.model.js',
  '../modules/loyalty/loyalty.model.js',
  '../modules/exports/export.model.js',
  '../modules/audit/audit.model.js',
  '../modules/inventory/stock.model.js',
  '../modules/customFields/customField.model.js',
  '../modules/cart/cart.model.js',
  '../modules/site/menu.model.js',
  '../modules/site/layout.model.js',
  '../modules/site/redirect.model.js',
  '../modules/tracking/tracking.model.js',
  '../modules/tracking/trackingLog.model.js',
  '../modules/staff/staff.model.js',
  '../modules/branches/branch.model.js',
  '../modules/campaigns/campaign.model.js',
  '../modules/returns/return.model.js',
  '../modules/orders/order.model.js',
  '../modules/i18n/i18n.model.js',
  '../modules/pages/page.model.js',
  '../modules/categories/category.model.js',
  '../modules/shifts/shift.model.js',
  '../modules/notifications/notification.model.js',
  '../modules/media/media.model.js',
];

let modelsLoaded = false;

/**
 * Ensures all models are imported so schemas and indexes are registered.
 */
export async function loadAllModels() {
  if (modelsLoaded) return;
  for (const modulePath of MODEL_MODULES) {
    await import(new URL(modulePath, import.meta.url).href);
  }
  modelsLoaded = true;
}

/**
 * Ensures and synchronizes all MongoDB indexes across all registered Mongoose models.
 * @param {object} [options]
 * @param {boolean} [options.background=true]
 * @returns {Promise<{ totalModels: number, syncedModels: string[], errors: Array<{ model: string, error: string }> }>}
 */
export async function ensureAllIndexes() {
  await loadAllModels();

  const models = Object.values(mongoose.models);
  const syncedModels = [];
  const errors = [];

  for (const model of models) {
    try {
      await model.syncIndexes();
      syncedModels.push(model.modelName);
    } catch (err) {
      errors.push({ model: model.modelName, error: err.message });
      logger.warn({ model: model.modelName, err: err.message }, 'Failed to sync indexes for model');
    }
  }

  return {
    totalModels: models.length,
    syncedModels,
    errors,
  };
}

// Standalone CLI runner
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      await connectDb();
      logger.info('Synchronizing database indexes...');
      const result = await ensureAllIndexes();
      logger.info(
        {
          total: result.totalModels,
          synced: result.syncedModels.length,
          errors: result.errors.length,
        },
        'Database index synchronization complete',
      );
      if (result.errors.length > 0) {
        logger.error({ errors: result.errors }, 'Errors occurred syncing indexes');
        process.exitCode = 1;
      }
    } catch (err) {
      logger.error({ err }, 'Fatal error syncing database indexes');
      process.exitCode = 1;
    } finally {
      await disconnectDb().catch(() => {});
    }
  })();
}
