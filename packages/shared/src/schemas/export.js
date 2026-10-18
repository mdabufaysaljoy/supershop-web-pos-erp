import { z } from 'zod';

export const EXPORT_FORMATS = Object.freeze(['xlsx', 'csv', 'json']);

export const EXPORT_RESOURCES = Object.freeze([
  'orders',
  'products',
  'customers',
  'inventory',
  'performance',
  'stockout',
  'audit',
]);

/**
 * Universal export column metadata.
 * Describes key, user-facing label, data type, whether it is included in default exports,
 * and optional permission requirement (e.g. cost visibility).
 */
export const RESOURCE_COLUMNS = Object.freeze({
  orders: [
    { key: 'orderNo', label: 'Order Number', type: 'string', default: true },
    { key: 'createdAt', label: 'Date Placed', type: 'date', default: true },
    { key: 'status', label: 'Status', type: 'string', default: true },
    { key: 'channel', label: 'Channel', type: 'string', default: true },
    { key: 'branchName', label: 'Branch', type: 'string', default: true },
    { key: 'customerName', label: 'Customer Name', type: 'string', default: true },
    { key: 'customerPhone', label: 'Customer Phone', type: 'string', default: true },
    { key: 'itemCount', label: 'Item Count', type: 'number', default: true },
    { key: 'subtotal', label: 'Subtotal (SAR)', type: 'money', default: true },
    { key: 'vat', label: 'VAT (SAR)', type: 'money', default: true },
    { key: 'total', label: 'Total (SAR)', type: 'money', default: true },
    { key: 'paymentMethod', label: 'Payment Method', type: 'string', default: true },
    { key: 'paymentStatus', label: 'Payment Status', type: 'string', default: true },
  ],
  products: [
    { key: 'sku', label: 'SKU', type: 'string', default: true },
    { key: 'barcode', label: 'Barcode', type: 'string', default: true },
    { key: 'name', label: 'Product Name', type: 'string', default: true },
    { key: 'status', label: 'Status', type: 'string', default: true },
    { key: 'brand', label: 'Brand', type: 'string', default: true },
    { key: 'categories', label: 'Categories', type: 'string', default: true },
    { key: 'price', label: 'Price (SAR)', type: 'money', default: true },
    { key: 'compareAt', label: 'Compare-at Price (SAR)', type: 'money', default: false },
    {
      key: 'cost',
      label: 'Cost Price (SAR)',
      type: 'money',
      default: false,
      permission: 'product.viewCost',
    },
    {
      key: 'marginPercent',
      label: 'Margin %',
      type: 'number',
      default: false,
      permission: 'product.viewCost',
    },
    { key: 'totalOnHand', label: 'Stock On Hand', type: 'number', default: true },
  ],
  customers: [
    { key: 'name', label: 'Customer Name', type: 'string', default: true },
    { key: 'phone', label: 'Phone', type: 'string', default: true },
    { key: 'email', label: 'Email', type: 'string', default: true },
    { key: 'segment', label: 'Segment', type: 'string', default: true },
    { key: 'loyaltyTier', label: 'Loyalty Tier', type: 'string', default: true },
    { key: 'loyaltyPoints', label: 'Loyalty Points', type: 'number', default: true },
    { key: 'orderCount', label: 'Total Orders', type: 'number', default: true },
    { key: 'totalSpent', label: 'Lifetime Spend (SAR)', type: 'money', default: true },
    { key: 'createdAt', label: 'Registered Date', type: 'date', default: true },
  ],
  inventory: [
    { key: 'sku', label: 'SKU', type: 'string', default: true },
    { key: 'barcode', label: 'Barcode', type: 'string', default: true },
    { key: 'productName', label: 'Product Name', type: 'string', default: true },
    { key: 'branchName', label: 'Branch', type: 'string', default: true },
    { key: 'onHand', label: 'Quantity On Hand', type: 'number', default: true },
    { key: 'lowStockThreshold', label: 'Low Stock Threshold', type: 'number', default: true },
    { key: 'status', label: 'Stock Status', type: 'string', default: true },
  ],
  performance: [
    { key: 'name', label: 'Dimension / Item', type: 'string', default: true },
    { key: 'orderCount', label: 'Orders', type: 'number', default: true },
    { key: 'quantity', label: 'Units Sold', type: 'number', default: true },
    { key: 'grossSales', label: 'Gross Sales (SAR)', type: 'money', default: true },
    { key: 'netSales', label: 'Net Sales (SAR)', type: 'money', default: true },
    { key: 'averageOrderValue', label: 'AOV (SAR)', type: 'money', default: true },
    { key: 'sharePercent', label: 'Share %', type: 'number', default: true },
    {
      key: 'cost',
      label: 'Cost (SAR)',
      type: 'money',
      default: false,
      permission: 'product.viewCost',
    },
    {
      key: 'grossProfit',
      label: 'Gross Profit (SAR)',
      type: 'money',
      default: false,
      permission: 'product.viewCost',
    },
    {
      key: 'marginPercent',
      label: 'Margin %',
      type: 'number',
      default: false,
      permission: 'product.viewCost',
    },
  ],
  stockout: [
    { key: 'sku', label: 'SKU', type: 'string', default: true },
    { key: 'productName', label: 'Product Name', type: 'string', default: true },
    { key: 'branchName', label: 'Branch', type: 'string', default: true },
    { key: 'onHand', label: 'Stock On Hand', type: 'number', default: true },
    { key: 'dailyVelocity', label: 'Daily Sales Velocity', type: 'number', default: true },
    { key: 'daysRemaining', label: 'Days Remaining', type: 'number', default: true },
    { key: 'riskLevel', label: 'Risk Level', type: 'string', default: true },
    { key: 'estimatedStockoutDate', label: 'Est. Stock-out Date', type: 'date', default: true },
    { key: 'recommendedReorderQty', label: 'Recommended Reorder', type: 'number', default: true },
  ],
  audit: [
    { key: 'timestamp', label: 'Timestamp', type: 'date', default: true },
    { key: 'actorName', label: 'Actor Name', type: 'string', default: true },
    { key: 'action', label: 'Action', type: 'string', default: true },
    { key: 'entity', label: 'Entity Type', type: 'string', default: true },
    { key: 'entityId', label: 'Entity ID', type: 'string', default: true },
    { key: 'ip', label: 'IP Address', type: 'string', default: false },
  ],
});

/** Returns default column keys for a resource */
export function getDefaultColumns(resource) {
  const cols = RESOURCE_COLUMNS[resource] ?? [];
  return cols.filter((c) => c.default).map((c) => c.key);
}

/** Returns all column keys for a resource */
export function getAllColumns(resource) {
  const cols = RESOURCE_COLUMNS[resource] ?? [];
  return cols.map((c) => c.key);
}

/**
 * Filters requested or available columns against actor permissions.
 *
 * @param {string} resource
 * @param {string[]} requestedColumns
 * @param {(perm: string) => boolean} can
 * @returns {string[]}
 */
export function filterPermittedColumns(resource, requestedColumns, can = () => true) {
  const defs = RESOURCE_COLUMNS[resource] ?? [];
  const allowedSet = new Set(
    defs.filter((d) => !d.permission || can(d.permission)).map((d) => d.key),
  );
  return requestedColumns.filter((col) => allowedSet.has(col));
}

export const createExportJobSchema = z.object({
  resource: z.enum(EXPORT_RESOURCES),
  format: z.enum(EXPORT_FORMATS),
  columns: z.array(z.string()).optional(),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  sort: z
    .object({
      field: z.string(),
      dir: z.enum(['asc', 'desc']).optional().default('desc'),
    })
    .optional(),
  title: z.string().trim().max(100).optional(),
});

export const exportJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  resource: z.enum(EXPORT_RESOURCES).optional(),
  status: z.enum(['queued', 'running', 'done', 'failed']).optional(),
});

export const reportPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  resource: z.enum(EXPORT_RESOURCES),
  columns: z.array(z.string()).min(1),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  format: z.enum(EXPORT_FORMATS).default('xlsx'),
  sort: z
    .object({
      field: z.string(),
      dir: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
});
