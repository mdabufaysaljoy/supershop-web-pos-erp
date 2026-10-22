import { sendData, sendNoContent } from '../../core/http.js';
import * as service from './alert.service.js';

export const list = async (req, res) =>
  sendData(res, await service.listAlerts(req.access, req.valid.query));

export const markRead = async (req, res) => {
  await service.markAlertsRead(req.access, req.valid.body?.ids);
  sendNoContent(res);
};
