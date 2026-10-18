import {
  calculateDeltaPercent,
  calculateStockoutRisk,
  getForecastingStrategy,
  listForecastingStrategies,
  ORDER_FLOW,
  parseHorizonDays,
  parseLookbackDays,
  PERMISSIONS,
  resolveAnalyticsPeriod,
} from '@supershop/shared';
import { getBranchSummaries } from '../branches/index.js';
import { countNewCustomers } from '../customers/index.js';
import { getInventoryHealth, getStockLevelsForPrediction } from '../inventory/index.js';
import {
  getDailySalesHistory,
  getDashboardOrderStats,
  getPerformanceReportStats,
  getVariantSalesVelocity,
} from '../orders/index.js';
import { getVariantSummaries } from '../products/index.js';

/**
 * Fills zero-order buckets in time-series data so charts have an unbroken axis.
 */
function fillTimeSeriesBuckets(rows, { start, end, groupBy }) {
  const map = new Map(rows.map((r) => [r.date, r]));
  const filled = [];

  const cur = new Date(start);
  const finish = new Date(end);

  if (groupBy === 'hour') {
    while (cur <= finish) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cur.getUTCDate()).padStart(2, '0');
      const h = String(cur.getUTCHours()).padStart(2, '0');
      const key = `${y}-${m}-${d} ${h}:00`;
      filled.push(
        map.get(key) ?? {
          date: key,
          revenue: 0,
          net: 0,
          orders: 0,
          posRevenue: 0,
          onlineRevenue: 0,
          posOrders: 0,
          onlineOrders: 0,
        },
      );
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
  } else if (groupBy === 'month') {
    while (cur <= finish) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      filled.push(
        map.get(key) ?? {
          date: key,
          revenue: 0,
          net: 0,
          orders: 0,
          posRevenue: 0,
          onlineRevenue: 0,
          posOrders: 0,
          onlineOrders: 0,
        },
      );
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  } else {
    // day
    while (cur <= finish) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cur.getUTCDate()).padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      filled.push(
        map.get(key) ?? {
          date: key,
          revenue: 0,
          net: 0,
          orders: 0,
          posRevenue: 0,
          onlineRevenue: 0,
          posOrders: 0,
          onlineOrders: 0,
        },
      );
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return filled;
}

export async function getDashboardOverview(actor, { range = '7d', branchId = null, now } = {}) {
  const period = resolveAnalyticsPeriod({ range, now });
  const { start, end, previousStart, previousEnd, groupBy } = period;

  const branchFilter = actor.branchFilter('branchId', branchId ?? null);

  const currentFilter = {
    ...branchFilter,
    status: { $in: [...ORDER_FLOW.sold] },
    placedAt: { $gte: start, $lte: end },
  };

  const previousFilter = {
    ...branchFilter,
    status: { $in: [...ORDER_FLOW.sold] },
    placedAt: { $gte: previousStart, $lte: previousEnd },
  };

  const recentFilter = {
    ...branchFilter,
  };

  const [ordersData, inventoryHealth, newCustomers, previousNewCustomers] = await Promise.all([
    getDashboardOrderStats({
      currentFilter,
      previousFilter,
      recentFilter,
      groupBy,
      topLimit: 5,
    }),
    getInventoryHealth(actor, branchId ?? null),
    countNewCustomers(start, end),
    countNewCustomers(previousStart, previousEnd),
  ]);

  const { current, previous } = ordersData;

  const currentAov =
    current.ordersCount > 0 ? Math.round(current.totalSales / current.ordersCount) : 0;
  const previousAov =
    previous.ordersCount > 0 ? Math.round(previous.totalSales / previous.ordersCount) : 0;

  const kpis = {
    totalSales: {
      current: current.totalSales,
      previous: previous.totalSales,
      changePercent: calculateDeltaPercent(current.totalSales, previous.totalSales),
    },
    netSales: {
      current: current.netSales,
      previous: previous.netSales,
      changePercent: calculateDeltaPercent(current.netSales, previous.netSales),
    },
    ordersCount: {
      current: current.ordersCount,
      previous: previous.ordersCount,
      changePercent: calculateDeltaPercent(current.ordersCount, previous.ordersCount),
    },
    averageOrderValue: {
      current: currentAov,
      previous: previousAov,
      changePercent: calculateDeltaPercent(currentAov, previousAov),
    },
    itemsSold: {
      current: current.itemsSold,
      previous: previous.itemsSold,
      changePercent: calculateDeltaPercent(current.itemsSold, previous.itemsSold),
    },
    newCustomers: {
      current: newCustomers,
      previous: previousNewCustomers,
      changePercent: calculateDeltaPercent(newCustomers, previousNewCustomers),
    },
    inventory: inventoryHealth,
  };

  const continuousTimeSeries = fillTimeSeriesBuckets(ordersData.timeSeries, {
    start,
    end,
    groupBy,
  });

  return {
    period: {
      range,
      start,
      end,
      previousStart,
      previousEnd,
      groupBy,
    },
    kpis,
    salesOverTime: continuousTimeSeries,
    channelBreakdown: ordersData.channelBreakdown,
    topProducts: ordersData.topProducts,
    recentOrders: ordersData.recentOrders,
    paymentMethods: ordersData.paymentMethods,
  };
}

/**
 * Generates a performance report breakdown for a specific dimension (P8.2).
 */
export async function getPerformanceReport(
  actor,
  {
    dimension = 'product',
    range = '7d',
    branchId = null,
    limit = 50,
    sortBy = 'revenue',
    sortDir = 'desc',
    now,
  } = {},
) {
  if (branchId) {
    actor.assertBranch(branchId);
  }

  let effectiveBranchId = branchId;
  if (!effectiveBranchId && !actor.allBranches) {
    effectiveBranchId = actor.branchIds?.[0] ?? null;
  }

  const period = resolveAnalyticsPeriod({ range, now });
  const { start, end } = period;

  const includeCost = actor.can(PERMISSIONS.PRODUCT_VIEW_COST);

  const stats = await getPerformanceReportStats({
    dimension,
    start,
    end,
    branchId: effectiveBranchId,
    limit,
    sortBy,
    sortDir,
    includeCost,
  });

  const { items, totals } = stats;
  const totalRevenue = totals.totalSales ?? 0;
  const totalNet = totals.netSales ?? 0;
  const totalOrders = totals.ordersCount ?? 0;
  const totalUnits = totals.itemsSold ?? 0;

  let totalCost = 0;
  let totalProfit = 0;

  const enrichedItems = items.map((item, index) => {
    const sharePercent =
      totalRevenue > 0 ? Number(((item.revenue / totalRevenue) * 100).toFixed(1)) : 0;
    if (includeCost && typeof item.cost === 'number') {
      totalCost += item.cost;
      totalProfit += item.profit ?? 0;
    }
    return {
      rank: index + 1,
      ...item,
      sharePercent,
    };
  });

  const summary = {
    totalRevenue,
    totalNet,
    totalOrders,
    totalUnits,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
  };

  if (includeCost && dimension === 'product') {
    summary.totalCost = totalCost;
    summary.totalProfit = totalProfit;
    summary.overallMargin = totalNet > 0 ? Number(((totalProfit / totalNet) * 100).toFixed(1)) : 0;
  }

  const chart = enrichedItems.slice(0, 10).map((i) => ({
    name: i.name,
    revenue: i.revenue,
    quantity: i.quantity,
    ordersCount: i.ordersCount,
    sharePercent: i.sharePercent,
  }));

  return {
    dimension,
    range,
    period: {
      start,
      end,
    },
    branchId: effectiveBranchId,
    summary,
    items: enrichedItems,
    chart,
  };
}

/**
 * Sales forecast with pluggable strategy (P8.3).
 */
export async function getSalesForecast({
  actor,
  strategy = 'moving_average',
  horizon = '14d',
  lookback = '30d',
  branchId = null,
  productId = null,
}) {
  let effectiveBranchId = branchId ?? null;
  if (effectiveBranchId) {
    actor.assertBranch(effectiveBranchId);
  } else {
    const scopedBranch = actor.branchFilter('branchId')?.branchId;
    if (scopedBranch) effectiveBranchId = String(scopedBranch);
  }

  const lookbackDays = parseLookbackDays(lookback);
  const horizonDays = parseHorizonDays(horizon);

  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end.getTime() - lookbackDays * 86400000 + 1);
  start.setUTCHours(0, 0, 0, 0);

  const rawHistory = await getDailySalesHistory({
    start,
    end,
    branchId: effectiveBranchId,
    productId,
  });

  // Zero-fill contiguous days for lookback window
  const historyMap = new Map(rawHistory.map((r) => [r.date, r]));
  const contiguousHistory = [];
  const cur = new Date(start);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    contiguousHistory.push(
      historyMap.get(key) ?? {
        date: key,
        quantity: 0,
        revenue: 0,
        orders: 0,
      },
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const strat = getForecastingStrategy(strategy);
  const forecastResult = strat.forecastSales({
    history: contiguousHistory,
    horizonDays,
  });

  const historicalTotalUnits = contiguousHistory.reduce((s, h) => s + (h.quantity || 0), 0);
  const historicalTotalRevenue = contiguousHistory.reduce((s, h) => s + (h.revenue || 0), 0);
  const historicalDailyAvgUnits = Number((historicalTotalUnits / lookbackDays).toFixed(1));
  const historicalDailyAvgRevenue = Math.round(historicalTotalRevenue / lookbackDays);

  const projectedGrowthPercent = calculateDeltaPercent(
    forecastResult.summary.dailyAvgRevenue,
    historicalDailyAvgRevenue,
  );

  return {
    strategy: {
      name: strat.name,
      label: strat.label,
      description: strat.description,
    },
    availableStrategies: listForecastingStrategies(),
    horizon,
    horizonDays,
    lookback,
    lookbackDays,
    branchId: effectiveBranchId,
    productId: productId ? String(productId) : null,
    historical: contiguousHistory,
    forecast: forecastResult.forecast,
    summary: {
      historicalTotalUnits,
      historicalTotalRevenue,
      historicalDailyAvgUnits,
      historicalDailyAvgRevenue,
      forecastTotalUnits: forecastResult.summary.totalForecastUnits,
      forecastTotalRevenue: forecastResult.summary.totalForecastRevenue,
      forecastDailyAvgUnits: forecastResult.summary.dailyAvgUnits,
      forecastDailyAvgRevenue: forecastResult.summary.dailyAvgRevenue,
      projectedGrowthPercent,
    },
  };
}

/**
 * Stock-out risk prediction for inventory replenishment (P8.3).
 */
export async function getStockoutForecast({
  actor,
  lookback = '30d',
  branchId = null,
  risk = 'all',
  targetDays = 30,
  search = null,
  limit = 50,
  page = 1,
  sortBy = 'daysRemaining',
  sortDir = 'asc',
}) {
  let effectiveBranchId = branchId ?? null;
  if (effectiveBranchId) {
    actor.assertBranch(effectiveBranchId);
  } else {
    const scopedBranch = actor.branchFilter('branchId')?.branchId;
    if (scopedBranch) effectiveBranchId = String(scopedBranch);
  }

  const lookbackDays = parseLookbackDays(lookback);
  const now = new Date();
  const end = new Date(now);
  const start = new Date(end.getTime() - lookbackDays * 86400000);

  const [stockLevels, velocities] = await Promise.all([
    getStockLevelsForPrediction({ branchId: effectiveBranchId }),
    getVariantSalesVelocity({ start, end, branchId: effectiveBranchId }),
  ]);

  const velocityMap = new Map(velocities.map((v) => [v.variantId, v]));

  // Lookup variant details & branch names
  const variantIds = [...new Set(stockLevels.map((l) => l.variantId))];
  const branchIds = [...new Set(stockLevels.map((l) => l.branchId).filter(Boolean))];

  const [variantsMap, branchesMap] = await Promise.all([
    getVariantSummaries(variantIds, { withCost: actor.can(PERMISSIONS.PRODUCT_VIEW_COST) }),
    getBranchSummaries(branchIds),
  ]);

  // Combine and calculate stockout prediction for each item
  const allItems = stockLevels.map((lvl) => {
    const variantId = lvl.variantId;
    const vInfo = variantsMap.get(variantId);
    const vel = velocityMap.get(variantId) ?? { unitsSold: 0, ordersCount: 0, revenue: 0 };

    const dailyVelocity = Number((vel.unitsSold / lookbackDays).toFixed(2));
    const riskData = calculateStockoutRisk({
      onHand: lvl.onHand,
      dailyVelocity,
      lowStockThreshold: lvl.lowStockThreshold,
      targetDays,
      now,
    });

    const bInfo = lvl.branchId ? branchesMap.get(lvl.branchId) : null;
    let branchName = null;
    if (bInfo) {
      branchName = typeof bInfo.name === 'object' ? bInfo.name.en : bInfo.name;
    }

    let productName = '';
    if (vInfo?.productName) {
      productName =
        typeof vInfo.productName === 'object' ? vInfo.productName.en : vInfo.productName;
    } else if (vel.name) {
      productName = vel.name;
    }

    const variantLabel = (vInfo?.options ?? [])
      .map((o) => {
        const n = typeof o.name === 'object' ? o.name.en : o.name;
        const v = typeof o.value === 'object' ? o.value.en : o.value;
        return `${n}: ${v}`;
      })
      .join(', ');

    return {
      variantId,
      productId: lvl.productId,
      sku: vInfo?.sku || vel.sku || '',
      barcode: vInfo?.barcode || null,
      productName,
      variantLabel,
      branchId: lvl.branchId,
      branchName,
      onHand: lvl.onHand,
      lowStockThreshold: lvl.lowStockThreshold,
      dailyVelocity,
      unitsSoldLookback: vel.unitsSold,
      ordersCountLookback: vel.ordersCount,
      daysRemaining: riskData.daysRemaining,
      estimatedStockoutDate: riskData.estimatedStockoutDate,
      riskLevel: riskData.riskLevel,
      recommendedReorderQty: riskData.recommendedReorderQty,
    };
  });

  // Summary counts
  let outOfStockCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let healthyCount = 0;
  let totalRecommendedReorderUnits = 0;

  for (const item of allItems) {
    if (item.riskLevel === 'out_of_stock') outOfStockCount += 1;
    else if (item.riskLevel === 'critical') criticalCount += 1;
    else if (item.riskLevel === 'warning') warningCount += 1;
    else if (item.riskLevel === 'healthy') healthyCount += 1;

    totalRecommendedReorderUnits += item.recommendedReorderQty;
  }

  // Filter by risk
  let filtered = allItems;
  if (risk && risk !== 'all') {
    filtered = filtered.filter((i) => i.riskLevel === risk);
  }

  // Filter by search
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.sku.toLowerCase().includes(q) ||
        i.productName.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.toLowerCase().includes(q)),
    );
  }

  // Sorting
  filtered.sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];

    if (sortBy === 'daysRemaining') {
      aVal = aVal === null ? Infinity : aVal;
      bVal = bVal === null ? Infinity : bVal;
    } else if (sortBy === 'name') {
      aVal = a.productName.toLowerCase();
      bVal = b.productName.toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
  });

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const paginated = filtered.slice(skip, skip + limit);

  return {
    summary: {
      totalTracked: allItems.length,
      outOfStockCount,
      criticalCount,
      warningCount,
      healthyCount,
      totalRecommendedReorderUnits,
    },
    items: paginated,
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    filters: {
      lookback,
      lookbackDays,
      branchId: effectiveBranchId,
      risk,
      targetDays,
      search: search ?? null,
    },
  };
}
