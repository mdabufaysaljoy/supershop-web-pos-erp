import {
  filterPermittedColumns,
  getDefaultColumns,
  PERMISSIONS as P,
  RESOURCE_COLUMNS,
} from '@supershop/shared';
import { ForbiddenError } from '../../core/errors.js';
import { getPerformanceReport, getStockoutForecast } from '../analytics/index.js';
import { listAuditEntries } from '../audit/index.js';
import { getBranchSummaries } from '../branches/index.js';
import { listCustomersForAdmin } from '../customers/index.js';
import { getStockLevelsForPrediction } from '../inventory/index.js';
import { getOrdersForExport } from '../orders/index.js';
import { iterateProducts } from '../products/index.js';
import { formatCellValue } from './serializer.js';

/**
 * Checks permission for exporting a specific resource.
 */
export function checkResourcePermission(actor, resource) {
  switch (resource) {
    case 'orders':
      if (!actor.can(P.ORDER_EXPORT) && !actor.can(P.ORDER_VIEW)) {
        throw new ForbiddenError('Missing permission order.export');
      }
      break;
    case 'products':
      if (!actor.can(P.PRODUCT_EXPORT) && !actor.can(P.PRODUCT_VIEW)) {
        throw new ForbiddenError('Missing permission product.export');
      }
      break;
    case 'customers':
      if (!actor.can(P.CUSTOMER_EXPORT) && !actor.can(P.CUSTOMER_VIEW)) {
        throw new ForbiddenError('Missing permission customer.export');
      }
      break;
    case 'inventory':
      if (!actor.can(P.INVENTORY_VIEW)) {
        throw new ForbiddenError('Missing permission inventory.view');
      }
      break;
    case 'performance':
    case 'stockout':
      if (!actor.can(P.REPORT_EXPORT) && !actor.can(P.REPORT_VIEW)) {
        throw new ForbiddenError('Missing permission report.export');
      }
      break;
    case 'audit':
      if (!actor.can(P.AUDIT_VIEW)) {
        throw new ForbiddenError('Missing permission audit.view');
      }
      break;
    default:
      throw new ForbiddenError(`Unknown resource: ${resource}`);
  }
}

/**
 * Registry of data fetchers for universal exports.
 */
const DATA_FETCHERS = {
  async orders({ actor, filters }) {
    const orders = await getOrdersForExport({ actor, filters, limit: 10_000 });
    const branchIds = [...new Set(orders.map((o) => o.branchId).filter(Boolean))];
    const branchMap = branchIds.length ? await getBranchSummaries(branchIds) : new Map();

    return orders.map((o) => {
      const b = o.branchId ? branchMap.get(String(o.branchId)) : null;
      const branchName = b
        ? typeof b.name === 'object'
          ? b.name.en || b.code
          : b.name
        : o.branchId
          ? String(o.branchId)
          : 'Online';

      return {
        orderNo: o.orderNo,
        createdAt: o.placedAt || o.createdAt,
        status: o.status,
        channel: o.channel,
        branchName,
        customerName: o.customer?.name ?? 'Walk-in',
        customerPhone: o.customer?.phone ?? '',
        itemCount: o.totals?.itemCount ?? 0,
        subtotal: o.totals?.subtotal ?? 0,
        vat: o.totals?.vat ?? 0,
        total: o.totals?.total ?? 0,
        paymentMethod: o.payment?.method ?? '',
        paymentStatus: o.payment?.status ?? '',
      };
    });
  },

  async products({ actor, filters }) {
    const rows = [];
    const canCost = actor.can(P.PRODUCT_VIEW_COST);
    for await (const p of iterateProducts(actor, filters, 200)) {
      for (const v of p.variants ?? []) {
        let marginPercent = null;
        if (canCost && v.cost != null && v.price > 0) {
          marginPercent = Number((((v.price - v.cost) / v.price) * 100).toFixed(1));
        }

        rows.push({
          sku: v.sku,
          barcode: v.barcode ?? '',
          name: p.name,
          status: p.status,
          brand: p.brand?.name ?? '',
          categories: (p.categories ?? []).map((c) => c.name).join(', '),
          price: v.price,
          compareAt: v.compareAt ?? null,
          cost: canCost ? (v.cost ?? null) : null,
          marginPercent,
          totalOnHand: v.totalOnHand ?? 0,
        });
      }
      if (rows.length >= 25_000) break;
    }
    return rows;
  },

  async customers({ filters }) {
    const { items } = await listCustomersForAdmin({
      limit: 10_000,
      q: filters.q,
      status: filters.status,
      segment: filters.segment,
    });

    return items.map((c) => ({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      segment: c.segment ?? 'new',
      loyaltyTier: c.loyaltyTier ?? 'bronze',
      loyaltyPoints: c.loyaltyPoints ?? 0,
      orderCount: c.orderCount ?? 0,
      totalSpent: c.lifetimeSpend ?? 0,
      createdAt: c.createdAt,
    }));
  },

  async inventory({ actor, filters }) {
    const branchId = filters.branchId || null;
    if (branchId && actor.branchFilter) {
      actor.assertBranch(branchId);
    }
    const levels = await getStockLevelsForPrediction({ branchId, limit: 10_000 });
    const branchIds = [...new Set(levels.map((lvl) => lvl.branchId).filter(Boolean))];
    const branchMap = branchIds.length ? await getBranchSummaries(branchIds) : new Map();

    return levels.map((lvl) => {
      const onHand = lvl.onHand ?? 0;
      const threshold = lvl.lowStockThreshold ?? 5;
      let status = 'in_stock';
      if (onHand <= 0) status = 'out_of_stock';
      else if (onHand <= threshold) status = 'low_stock';

      const b = lvl.branchId ? branchMap.get(String(lvl.branchId)) : null;
      const branchName = b
        ? typeof b.name === 'object'
          ? b.name.en || b.code
          : b.name
        : lvl.branchId
          ? String(lvl.branchId)
          : 'All';

      return {
        sku: lvl.sku,
        barcode: lvl.barcode ?? '',
        productName: lvl.productName,
        branchName,
        onHand,
        lowStockThreshold: threshold,
        status,
      };
    });
  },

  async performance({ actor, filters }) {
    const report = await getPerformanceReport({
      actor,
      dimension: filters.dimension || 'product',
      range: filters.range || '7d',
      branchId: filters.branchId || null,
      limit: 5_000,
      sortBy: filters.sortBy || 'revenue',
      sortDir: filters.sortDir || 'desc',
    });

    return (report.items ?? []).map((item) => ({
      name: item.name,
      orderCount: item.orderCount ?? 0,
      quantity: item.quantity ?? 0,
      grossSales: item.grossSales ?? 0,
      netSales: item.netSales ?? 0,
      averageOrderValue: item.averageOrderValue ?? 0,
      sharePercent: item.sharePercent ?? 0,
      cost: item.cost ?? null,
      grossProfit: item.grossProfit ?? null,
      marginPercent: item.marginPercent ?? null,
    }));
  },

  async stockout({ actor, filters }) {
    const report = await getStockoutForecast({
      actor,
      branchId: filters.branchId || null,
      riskLevel: filters.riskLevel || null,
      lookback: filters.lookback || '30d',
      horizon: filters.horizon || '14d',
      limit: 5_000,
    });

    return (report.items ?? []).map((item) => ({
      sku: item.sku,
      productName: item.productName,
      branchName: item.branchName,
      onHand: item.onHand ?? 0,
      dailyVelocity: item.dailyVelocity ?? 0,
      daysRemaining: item.daysRemaining === Infinity ? 999 : item.daysRemaining,
      riskLevel: item.riskLevel,
      estimatedStockoutDate: item.estimatedStockoutDate,
      recommendedReorderQty: item.recommendedReorderQty ?? 0,
    }));
  },

  async audit({ filters }) {
    const { items } = await listAuditEntries({
      page: 1,
      limit: 5_000,
      sort: { field: 'at', direction: -1 },
      action: filters.action,
      actorId: filters.actorId,
      entityType: filters.entityType,
      entityId: filters.entityId,
      from: filters.from,
      to: filters.to,
    });

    return items.map((a) => ({
      timestamp: a.at,
      actorName: a.actorId ?? 'System',
      action: a.action,
      entity: a.entityType ?? '',
      entityId: a.entityId ?? '',
      ip: a.data?.ip ?? '',
    }));
  },
};

/**
 * Fetches and prepares tabular data for a given resource and selected columns.
 *
 * @param {{
 *   actor: object,
 *   resource: string,
 *   columns?: string[],
 *   filters?: object,
 * }} params
 * @returns {Promise<{ headers: string[], keys: string[], rows: any[][] }>}
 */
export async function getExportData({ actor, resource, columns, filters = {} }) {
  checkResourcePermission(actor, resource);

  const fetcher = DATA_FETCHERS[resource];
  if (!fetcher) throw new Error(`No fetcher registered for resource: ${resource}`);

  // Determine allowed columns
  const availableColDefs = RESOURCE_COLUMNS[resource] ?? [];
  const requested = columns && columns.length ? columns : getDefaultColumns(resource);
  const activeKeys = filterPermittedColumns(resource, requested, actor.can.bind(actor));

  const colMap = new Map(availableColDefs.map((c) => [c.key, c]));
  const headers = activeKeys.map((key) => colMap.get(key)?.label ?? key);

  // Fetch raw item objects
  const rawItems = await fetcher({ actor, filters });

  // Map raw objects into 2D row arrays
  const rows = rawItems.map((item) =>
    activeKeys.map((key) => {
      const colDef = colMap.get(key);
      const val = item[key];
      return formatCellValue(val, colDef?.type);
    }),
  );

  return { headers, keys: activeKeys, rows };
}
