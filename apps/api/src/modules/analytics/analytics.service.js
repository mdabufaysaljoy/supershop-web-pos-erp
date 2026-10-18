import { calculateDeltaPercent, ORDER_FLOW, resolveAnalyticsPeriod } from '@supershop/shared';
import { countNewCustomers } from '../customers/index.js';
import { getInventoryHealth } from '../inventory/index.js';
import { getDashboardOrderStats } from '../orders/index.js';

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
