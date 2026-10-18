import { sendData } from '../../core/http.js';
import * as s from './analytics.service.js';

export async function getDashboard(req, res) {
  const actor = req.access;
  const overview = await s.getDashboardOverview(actor, req.valid.query);
  sendData(res, overview);
}

export async function getPerformance(req, res) {
  const actor = req.access;
  const report = await s.getPerformanceReport(actor, req.valid.query);
  sendData(res, report);
}

export async function getSalesForecast(req, res) {
  const actor = req.access;
  const forecast = await s.getSalesForecast({ actor, ...req.valid.query });
  sendData(res, forecast);
}

export async function getStockoutForecast(req, res) {
  const actor = req.access;
  const prediction = await s.getStockoutForecast({ actor, ...req.valid.query });
  sendData(res, prediction);
}
