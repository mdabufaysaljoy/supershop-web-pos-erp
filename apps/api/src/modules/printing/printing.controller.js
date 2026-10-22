import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './printing.service.js';

/** Thin HTTP layer: parse (already validated) → service → respond. */

export const status = async (_req, res) => sendData(res, service.printingStatus());

/** QZ Tray asks for this first; it is the shop's public certificate. */
export const certificate = async (_req, res) => {
  res.type('text/plain').send(service.getCertificate());
};

/** QZ Tray will not talk to a printer until the shop's own server has signed the call. */
export const sign = async (req, res) =>
  sendData(res, { signature: service.signForQz(req.valid.body.data) });

export const listProfiles = async (req, res) =>
  sendData(res, await service.listProfiles(req.valid.query));

export const getProfile = async (req, res) =>
  sendData(res, await service.getProfile(req.valid.params.id));

export const createProfile = async (req, res) =>
  sendCreated(res, await service.createProfile(req.access, req.valid.body));

export const updateProfile = async (req, res) =>
  sendData(res, await service.updateProfile(req.access, req.valid.params.id, req.valid.body));

export const deleteProfile = async (req, res) => {
  await service.deleteProfile(req.access, req.valid.params.id);
  sendNoContent(res);
};

/** The receipt for an order, ready for the printer it belongs on. */
export const receiptJob = async (req, res) =>
  sendData(
    res,
    await service.receiptJobForOrder(req.access, req.valid.params.id, {
      profileId: req.valid.query.profileId,
      lang: requestLanguage(req),
    }),
  );

export const getTemplates = async (_req, res) => sendData(res, await service.getTemplates());

export const updateReceiptTemplate = async (req, res) =>
  sendData(res, await service.updateReceiptTemplate(req.access, req.valid.body));

export const updateLabelTemplate = async (req, res) =>
  sendData(res, await service.updateLabelTemplate(req.access, req.valid.body));

export const labelJob = async (req, res) =>
  sendData(res, await service.buildLabelJob(req.access, req.valid.body));
export const loyaltyCardJob = async (req, res) =>
  sendData(res, await service.buildLoyaltyCardJob(req.access, req.valid.body));
