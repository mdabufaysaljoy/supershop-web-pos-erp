import { sendData } from '../../core/http.js';
import * as s from './analytics.service.js';

export async function getDashboard(req, res) {
  const actor = req.access;
  const overview = await s.getDashboardOverview(actor, req.valid.query);
  sendData(res, overview);
}
