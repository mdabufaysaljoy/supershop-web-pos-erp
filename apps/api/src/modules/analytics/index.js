/** Analytics module — public API (P8.1, P8.2, P8.3). */
export { createAnalyticsRouter } from './analytics.routes.js';
export {
  getDashboardOverview,
  getPerformanceReport,
  getSalesForecast,
  getStockoutForecast,
} from './analytics.service.js';
