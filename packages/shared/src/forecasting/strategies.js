/**
 * Pluggable forecasting strategies for sales and stock-out predictions (P8.3).
 * Shared pure logic (no express/mongoose/react).
 */

/**
 * Calculates standard deviation for an array of numbers given their mean.
 *
 * @param {number[]} values
 * @param {number} mean
 * @returns {number}
 */
function calculateStdDev(values, mean) {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Strategy 1: Simple Moving Average (SMA).
 * Computes mean daily velocity and projects flat daily demand with variance-based confidence bounds.
 */
export const movingAverageStrategy = Object.freeze({
  name: 'moving_average',
  label: 'Simple Moving Average',
  description:
    'Projects daily sales based on historical average rate with standard deviation confidence bounds.',
  forecastSales({ history = [], horizonDays = 14 }) {
    if (!history.length || horizonDays <= 0) {
      return {
        forecast: [],
        summary: {
          dailyAvgUnits: 0,
          dailyAvgRevenue: 0,
          totalForecastUnits: 0,
          totalForecastRevenue: 0,
        },
      };
    }

    const n = history.length;
    const totalUnits = history.reduce((sum, h) => sum + (h.quantity || 0), 0);
    const totalRevenue = history.reduce((sum, h) => sum + (h.revenue || 0), 0);

    const avgUnits = totalUnits / n;
    const avgRevenue = totalRevenue / n;

    const stdDevUnits = calculateStdDev(
      history.map((h) => h.quantity || 0),
      avgUnits,
    );
    const stdDevRevenue = calculateStdDev(
      history.map((h) => h.revenue || 0),
      avgRevenue,
    );

    const lastDateStr = history[history.length - 1].date;
    const lastDate = new Date(`${lastDateStr}T00:00:00.000Z`);

    const forecast = [];
    let runningForecastUnits = 0;
    let runningForecastRevenue = 0;

    for (let i = 1; i <= horizonDays; i += 1) {
      const futureDate = new Date(lastDate.getTime() + i * 86400000);
      const dateStr = futureDate.toISOString().slice(0, 10);

      const quantity = Number(avgUnits.toFixed(1));
      const revenue = Math.round(avgRevenue);

      const lowerQuantity = Math.max(0, Number((avgUnits - 1.96 * stdDevUnits).toFixed(1)));
      const upperQuantity = Number((avgUnits + 1.96 * stdDevUnits).toFixed(1));

      const lowerRevenue = Math.max(0, Math.round(avgRevenue - 1.96 * stdDevRevenue));
      const upperRevenue = Math.round(avgRevenue + 1.96 * stdDevRevenue);

      runningForecastUnits += quantity;
      runningForecastRevenue += revenue;

      forecast.push({
        date: dateStr,
        quantity,
        revenue,
        lowerQuantity,
        upperQuantity,
        lowerRevenue,
        upperRevenue,
      });
    }

    return {
      forecast,
      summary: {
        dailyAvgUnits: Number(avgUnits.toFixed(1)),
        dailyAvgRevenue: Math.round(avgRevenue),
        totalForecastUnits: Number(runningForecastUnits.toFixed(1)),
        totalForecastRevenue: runningForecastRevenue,
      },
    };
  },
});

/**
 * Strategy 2: Day-of-Week Seasonality Decomposition.
 * Analyzes day-of-week indices (0=Sun..6=Sat) to project weekly cyclical patterns.
 */
export const seasonalityStrategy = Object.freeze({
  name: 'seasonality',
  label: 'Day-of-Week Seasonality',
  description: 'Decomposes demand by day-of-week to capture cyclical retail shopping patterns.',
  forecastSales({ history = [], horizonDays = 14 }) {
    if (!history.length || horizonDays <= 0) {
      return {
        forecast: [],
        summary: {
          dailyAvgUnits: 0,
          dailyAvgRevenue: 0,
          totalForecastUnits: 0,
          totalForecastRevenue: 0,
        },
      };
    }

    const n = history.length;
    const totalUnits = history.reduce((sum, h) => sum + (h.quantity || 0), 0);
    const totalRevenue = history.reduce((sum, h) => sum + (h.revenue || 0), 0);

    const globalAvgUnits = totalUnits / n;
    const globalAvgRevenue = totalRevenue / n;

    const stdDevUnits = calculateStdDev(
      history.map((h) => h.quantity || 0),
      globalAvgUnits,
    );
    const stdDevRevenue = calculateStdDev(
      history.map((h) => h.revenue || 0),
      globalAvgRevenue,
    );

    // Group history by day-of-week
    const dowBuckets = Array.from({ length: 7 }, () => ({ units: [], revenues: [] }));
    for (const item of history) {
      const d = new Date(`${item.date}T00:00:00.000Z`).getUTCDay();
      dowBuckets[d].units.push(item.quantity || 0);
      dowBuckets[d].revenues.push(item.revenue || 0);
    }

    // Compute seasonal indices
    const dowMultipliers = dowBuckets.map((b) => {
      const dayAvgUnits = b.units.length
        ? b.units.reduce((s, u) => s + u, 0) / b.units.length
        : globalAvgUnits;
      const dayAvgRevenue = b.revenues.length
        ? b.revenues.reduce((s, r) => s + r, 0) / b.revenues.length
        : globalAvgRevenue;

      return {
        unitMultiplier: globalAvgUnits > 0 ? dayAvgUnits / globalAvgUnits : 1.0,
        revenueMultiplier: globalAvgRevenue > 0 ? dayAvgRevenue / globalAvgRevenue : 1.0,
      };
    });

    const lastDateStr = history[history.length - 1].date;
    const lastDate = new Date(`${lastDateStr}T00:00:00.000Z`);

    const forecast = [];
    let runningForecastUnits = 0;
    let runningForecastRevenue = 0;

    for (let i = 1; i <= horizonDays; i += 1) {
      const futureDate = new Date(lastDate.getTime() + i * 86400000);
      const dateStr = futureDate.toISOString().slice(0, 10);
      const dow = futureDate.getUTCDay();
      const mult = dowMultipliers[dow] || { unitMultiplier: 1.0, revenueMultiplier: 1.0 };

      const baseUnit = globalAvgUnits * mult.unitMultiplier;
      const baseRev = globalAvgRevenue * mult.revenueMultiplier;

      const quantity = Number(baseUnit.toFixed(1));
      const revenue = Math.round(baseRev);

      const lowerQuantity = Math.max(
        0,
        Number(((globalAvgUnits - 1.96 * stdDevUnits) * mult.unitMultiplier).toFixed(1)),
      );
      const upperQuantity = Number(
        ((globalAvgUnits + 1.96 * stdDevUnits) * mult.unitMultiplier).toFixed(1),
      );

      const lowerRevenue = Math.max(
        0,
        Math.round((globalAvgRevenue - 1.96 * stdDevRevenue) * mult.revenueMultiplier),
      );
      const upperRevenue = Math.round(
        (globalAvgRevenue + 1.96 * stdDevRevenue) * mult.revenueMultiplier,
      );

      runningForecastUnits += quantity;
      runningForecastRevenue += revenue;

      forecast.push({
        date: dateStr,
        quantity,
        revenue,
        lowerQuantity,
        upperQuantity,
        lowerRevenue,
        upperRevenue,
      });
    }

    return {
      forecast,
      summary: {
        dailyAvgUnits: Number((runningForecastUnits / horizonDays).toFixed(1)),
        dailyAvgRevenue: Math.round(runningForecastRevenue / horizonDays),
        totalForecastUnits: Number(runningForecastUnits.toFixed(1)),
        totalForecastRevenue: runningForecastRevenue,
      },
    };
  },
});

// Pluggable Strategy Registry
const REGISTRY = new Map();

export function registerForecastingStrategy(strategy) {
  if (!strategy || !strategy.name || typeof strategy.forecastSales !== 'function') {
    throw new Error('Invalid forecasting strategy interface');
  }
  REGISTRY.set(strategy.name, strategy);
}

export function getForecastingStrategy(name) {
  return REGISTRY.get(name) || REGISTRY.get('moving_average');
}

export function listForecastingStrategies() {
  return Array.from(REGISTRY.values()).map((s) => ({
    name: s.name,
    label: s.label,
    description: s.description,
  }));
}

// Register default strategies
registerForecastingStrategy(movingAverageStrategy);
registerForecastingStrategy(seasonalityStrategy);

/**
 * Calculates stock-out depletion time, risk classification, and replenishment recommendation.
 *
 * @param {Object} params
 * @param {number} params.onHand Current stock units on hand.
 * @param {number} params.dailyVelocity Average units sold per day.
 * @param {number} [params.lowStockThreshold] Configured low-stock threshold.
 * @param {number} [params.targetDays=30] Target safety stock days for reorder calculation.
 * @param {Date} [params.now=new Date()] Reference time for date calculations.
 * @returns {{
 *   daysRemaining: number|null,
 *   estimatedStockoutDate: string|null,
 *   riskLevel: 'out_of_stock'|'critical'|'warning'|'healthy',
 *   recommendedReorderQty: number
 * }}
 */
export function calculateStockoutRisk({
  onHand = 0,
  dailyVelocity = 0,
  lowStockThreshold = null,
  targetDays = 30,
  now = new Date(),
}) {
  const stock = Number(onHand) || 0;
  const velocity = Number(dailyVelocity) || 0;
  const threshold = lowStockThreshold != null ? Number(lowStockThreshold) : 5;

  // Case 1: Already completely depleted or negative
  if (stock <= 0) {
    const targetStock = velocity > 0 ? Math.ceil(targetDays * velocity) : threshold;
    return {
      daysRemaining: 0,
      estimatedStockoutDate: now.toISOString(),
      riskLevel: 'out_of_stock',
      recommendedReorderQty: Math.max(0, targetStock - stock),
    };
  }

  // Case 2: No historical velocity (dormant or new item)
  if (velocity <= 0) {
    const isBelowThreshold = stock <= threshold;
    return {
      daysRemaining: null,
      estimatedStockoutDate: null,
      riskLevel: isBelowThreshold ? 'warning' : 'healthy',
      recommendedReorderQty: 0,
    };
  }

  // Case 3: Positive stock and active velocity
  const daysRemaining = Number((stock / velocity).toFixed(1));
  const msRemaining = daysRemaining * 86400000;
  const estimatedStockoutDate = new Date(now.getTime() + msRemaining).toISOString();

  let riskLevel = 'healthy';
  if (daysRemaining <= 3) {
    riskLevel = 'critical';
  } else if (daysRemaining <= 7 || stock <= threshold) {
    riskLevel = 'warning';
  }

  const targetStock = Math.ceil(targetDays * velocity);
  const recommendedReorderQty = Math.max(0, targetStock - stock);

  return {
    daysRemaining,
    estimatedStockoutDate,
    riskLevel,
    recommendedReorderQty,
  };
}
