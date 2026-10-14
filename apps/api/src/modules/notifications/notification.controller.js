import { sendData } from '../../core/http.js';
import * as service from './notification.service.js';

/** Thin HTTP layer. `deps` lets the tests hand in a fake SMS gateway. */

export const listTemplates = async (_req, res) => sendData(res, await service.listTemplates());

export const updateTemplate = async (req, res) =>
  sendData(res, await service.updateTemplate(req.valid.params.id, req.valid.body));

export const logs = async (req, res) => {
  const { data, meta } = await service.listLogs(req.valid.query);
  res.set('Cache-Control', 'private, no-store');
  sendData(res, data, { meta });
};

export const test =
  (deps = {}) =>
  async (req, res) =>
    sendData(res, await service.sendTestMessage(req.valid.body, deps));
