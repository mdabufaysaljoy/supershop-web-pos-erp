import { sendData } from '../../core/http.js';
import * as service from './settings.service.js';

export const list = (req, res) =>
  sendData(res, service.listSettings(req.access, req.valid.query), {
    meta: { groups: service.listGroups() },
  });

export const update = async (req, res) => {
  const values = Object.fromEntries(req.valid.body.changes.map((c) => [c.key, c.value]));
  sendData(res, await service.updateSettings(req.access, values));
};

export const reset = async (req, res) =>
  sendData(res, await service.resetSettings(req.access, req.valid.body.keys));

export const publicSettings = (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  sendData(res, service.getPublicSettings());
};
