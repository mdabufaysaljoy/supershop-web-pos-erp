import { sendData } from '../../core/http.js';
import * as service from './transfer.service.js';

const sendFile = (res, { body, contentType, fileName }) => {
  res.set('Content-Type', contentType);
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(body);
};

export const template = async (req, res) =>
  sendFile(res, await service.buildTemplate(req.access, req.valid.query.format));
export const startImport = async (req, res) => {
  const file = req.file && { buffer: req.file.buffer, originalName: req.file.originalname };
  sendData(res, await service.startImport(req.access, file, req.valid.body), { status: 202 });
};
export const startExport = async (req, res) =>
  sendData(res, await service.startExport(req.access, req.valid.body), { status: 202 });
export const list = async (req, res) =>
  sendData(res, await service.listJobs(req.access, req.valid.query.type));
export const get = async (req, res) =>
  sendData(res, await service.getJob(req.access, req.valid.params.id));
export const download = async (req, res) =>
  sendFile(res, await service.downloadExport(req.access, req.valid.params.id));
