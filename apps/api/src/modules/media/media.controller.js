import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import * as service from './media.service.js';

export const list = async (req, res) => {
  const { items, meta } = await service.listMedia(req.valid.query);
  sendData(res, items, { meta });
};
export const get = async (req, res) => sendData(res, await service.getMedia(req.valid.params.id));
export const upload = async (req, res) => {
  const file = req.file && { buffer: req.file.buffer, originalName: req.file.originalname };
  const { media, duplicate } = await service.uploadMedia(req.access, file, req.valid.body);
  // Existing identical file → 200 (nothing created); new → 201.
  if (duplicate) return sendData(res, media, { meta: { duplicate: true } });
  return sendCreated(res, media, { duplicate: false });
};
export const update = async (req, res) =>
  sendData(res, await service.updateMedia(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteMedia(req.access, req.valid.params.id);
  sendNoContent(res);
};
