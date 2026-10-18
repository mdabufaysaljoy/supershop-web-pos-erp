import { describe, expect, it } from 'vitest';
import {
  calculateStockoutRisk,
  createAnalyticsSchemas,
  FORECAST,
  getForecastingStrategy,
  listForecastingStrategies,
  movingAverageStrategy,
  parseHorizonDays,
  parseLookbackDays,
  registerForecastingStrategy,
  seasonalityStrategy,
} from '../index.js';

describe('Forecasting Shared Contracts & Strategies (P8.3)', () => {
  describe('Moving Average Strategy', () => {
    it('returns empty forecast when history is empty', () => {
      const res = movingAverageStrategy.forecastSales({ history: [], horizonDays: 7 });
      expect(res.forecast).toEqual([]);
      expect(res.summary.dailyAvgUnits).toBe(0);
      expect(res.summary.totalForecastUnits).toBe(0);
    });

    it('forecasts flat demand based on mean daily velocity and std dev', () => {
      // 5 days of data: 10, 10, 10, 10, 10 units, 1000 SAR each
      const history = [
        { date: '2026-10-01', quantity: 10, revenue: 1000, orders: 2 },
        { date: '2026-10-02', quantity: 10, revenue: 1000, orders: 2 },
        { date: '2026-10-03', quantity: 10, revenue: 1000, orders: 2 },
        { date: '2026-10-04', quantity: 10, revenue: 1000, orders: 2 },
        { date: '2026-10-05', quantity: 10, revenue: 1000, orders: 2 },
      ];

      const res = movingAverageStrategy.forecastSales({ history, horizonDays: 3 });
      expect(res.forecast).toHaveLength(3);
      expect(res.forecast[0].date).toBe('2026-10-06');
      expect(res.forecast[1].date).toBe('2026-10-07');
      expect(res.forecast[2].date).toBe('2026-10-08');

      expect(res.forecast[0].quantity).toBe(10);
      expect(res.forecast[0].revenue).toBe(1000);
      expect(res.summary.dailyAvgUnits).toBe(10);
      expect(res.summary.dailyAvgRevenue).toBe(1000);
      expect(res.summary.totalForecastUnits).toBe(30);
      expect(res.summary.totalForecastRevenue).toBe(3000);
    });

    it('calculates confidence intervals when variance exists', () => {
      const history = [
        { date: '2026-10-01', quantity: 5, revenue: 500, orders: 1 },
        { date: '2026-10-02', quantity: 15, revenue: 1500, orders: 3 },
      ];
      const res = movingAverageStrategy.forecastSales({ history, horizonDays: 2 });
      expect(res.forecast).toHaveLength(2);
      expect(res.forecast[0].quantity).toBe(10);
      expect(res.forecast[0].lowerQuantity).toBeLessThan(10);
      expect(res.forecast[0].upperQuantity).toBeGreaterThan(10);
    });
  });

  describe('Seasonality Strategy', () => {
    it('applies day-of-week multipliers correctly', () => {
      // 2026-10-04 is Sunday (0), 2026-10-05 is Monday (1)
      // Suppose Sunday has double the volume of Monday
      const history = [
        { date: '2026-10-04', quantity: 20, revenue: 2000, orders: 4 }, // Sun
        { date: '2026-10-05', quantity: 10, revenue: 1000, orders: 2 }, // Mon
      ];

      // Horizon of 2 days: 2026-10-06 (Tue - no history so fallback to global avg 15), 2026-10-11 (Sun - multiplier 20/15)
      const res = seasonalityStrategy.forecastSales({ history, horizonDays: 7 });
      expect(res.forecast).toHaveLength(7);

      // Verify that next Sunday (2026-10-11) has higher forecast than next Monday (2026-10-12)
      const sunForecast = res.forecast.find((f) => f.date === '2026-10-11');
      const monForecast = res.forecast.find((f) => f.date === '2026-10-12');

      expect(sunForecast).toBeDefined();
      expect(monForecast).toBeDefined();
      expect(sunForecast.quantity).toBeGreaterThan(monForecast.quantity);
    });
  });

  describe('Strategy Registry', () => {
    it('retrieves built-in strategies and lists them', () => {
      const sma = getForecastingStrategy('moving_average');
      expect(sma.name).toBe('moving_average');

      const dow = getForecastingStrategy('seasonality');
      expect(dow.name).toBe('seasonality');

      // Fallback
      const unknown = getForecastingStrategy('non_existent');
      expect(unknown.name).toBe('moving_average');

      const list = listForecastingStrategies();
      expect(list.some((s) => s.name === 'moving_average')).toBe(true);
      expect(list.some((s) => s.name === 'seasonality')).toBe(true);
    });

    it('allows registering a custom strategy', () => {
      const customStrategy = {
        name: 'custom_growth',
        label: 'Custom Growth',
        description: 'Exponential trend strategy',
        forecastSales: () => ({ forecast: [], summary: {} }),
      };
      registerForecastingStrategy(customStrategy);
      expect(getForecastingStrategy('custom_growth').label).toBe('Custom Growth');
    });
  });

  describe('Stock-Out Risk Calculation', () => {
    const fixedNow = new Date('2026-10-18T12:00:00.000Z');

    it('handles out of stock items (onHand <= 0)', () => {
      const res = calculateStockoutRisk({
        onHand: 0,
        dailyVelocity: 2.5,
        targetDays: 30,
        now: fixedNow,
      });

      expect(res.riskLevel).toBe('out_of_stock');
      expect(res.daysRemaining).toBe(0);
      expect(res.estimatedStockoutDate).toBe(fixedNow.toISOString());
      expect(res.recommendedReorderQty).toBe(75); // 30 * 2.5
    });

    it('identifies critical risk (daysRemaining <= 3)', () => {
      const res = calculateStockoutRisk({
        onHand: 6,
        dailyVelocity: 3.0, // 2 days of stock left
        targetDays: 30,
        now: fixedNow,
      });

      expect(res.riskLevel).toBe('critical');
      expect(res.daysRemaining).toBe(2);
      expect(res.recommendedReorderQty).toBe(84); // Math.ceil(30 * 3) - 6 = 90 - 6
    });

    it('identifies warning risk (daysRemaining <= 7 or onHand <= threshold)', () => {
      const res = calculateStockoutRisk({
        onHand: 15,
        dailyVelocity: 2.5, // 6 days left
        targetDays: 30,
        now: fixedNow,
      });

      expect(res.riskLevel).toBe('warning');
      expect(res.daysRemaining).toBe(6);
    });

    it('identifies healthy stock (daysRemaining > 7)', () => {
      const res = calculateStockoutRisk({
        onHand: 100,
        dailyVelocity: 2.0, // 50 days left
        targetDays: 30,
        now: fixedNow,
      });

      expect(res.riskLevel).toBe('healthy');
      expect(res.daysRemaining).toBe(50);
      expect(res.recommendedReorderQty).toBe(0); // target stock is 60, we have 100
    });

    it('handles zero velocity gracefully without NaN/Infinity', () => {
      const res = calculateStockoutRisk({
        onHand: 20,
        dailyVelocity: 0,
        targetDays: 30,
        now: fixedNow,
      });

      expect(res.daysRemaining).toBeNull();
      expect(res.estimatedStockoutDate).toBeNull();
      expect(res.riskLevel).toBe('healthy');
      expect(res.recommendedReorderQty).toBe(0);
    });
  });

  describe('Schemas and Helpers', () => {
    const schemas = createAnalyticsSchemas();

    it('exports FORECAST constants', () => {
      expect(FORECAST.STRATEGIES).toContain('moving_average');
      expect(FORECAST.STRATEGIES).toContain('seasonality');
      expect(FORECAST.HORIZONS).toContain('14d');
      expect(FORECAST.RISK_LEVELS).toContain('critical');
    });

    it('validates salesForecastQuery with sensible defaults', () => {
      const parsed = schemas.salesForecastQuery.parse({});
      expect(parsed.strategy).toBe('moving_average');
      expect(parsed.horizon).toBe('14d');
      expect(parsed.lookback).toBe('30d');
      expect(parsed.branchId).toBeUndefined();
      expect(parsed.productId).toBeUndefined();
    });

    it('validates stockoutForecastQuery with sensible defaults', () => {
      const parsed = schemas.stockoutForecastQuery.parse({});
      expect(parsed.risk).toBe('all');
      expect(parsed.lookback).toBe('30d');
      expect(parsed.targetDays).toBe(30);
      expect(parsed.sortBy).toBe('daysRemaining');
      expect(parsed.sortDir).toBe('asc');
    });

    it('parses horizon and lookback days accurately', () => {
      expect(parseHorizonDays('7d')).toBe(7);
      expect(parseHorizonDays('14d')).toBe(14);
      expect(parseHorizonDays('30d')).toBe(30);

      expect(parseLookbackDays('14d')).toBe(14);
      expect(parseLookbackDays('30d')).toBe(30);
      expect(parseLookbackDays('60d')).toBe(60);
      expect(parseLookbackDays('90d')).toBe(90);
    });
  });
});
