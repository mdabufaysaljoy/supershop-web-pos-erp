import { sendCreated, sendData } from '../../core/http.js';
import { requestContext } from '../auth/index.js';
import * as service from './account.service.js';

/** The customer id ALWAYS comes from the session, never from the request. */
const me = (req) => req.auth.principalId;

export const getAccount = async (req, res) => sendData(res, await service.getAccount(me(req)));

export const updateProfile = async (req, res) =>
  sendData(res, await service.updateProfile(me(req), req.valid.body, requestContext(req)));

export const listAddresses = async (req, res) =>
  sendData(res, (await service.getAccount(me(req))).addresses);

export const addAddress = async (req, res) =>
  sendCreated(res, await service.addAddress(me(req), req.valid.body, requestContext(req)));

export const updateAddress = async (req, res) =>
  sendData(
    res,
    await service.updateAddress(
      me(req),
      req.valid.params.addressId,
      req.valid.body,
      requestContext(req),
    ),
  );

export const removeAddress = async (req, res) =>
  sendData(
    res,
    await service.removeAddress(me(req), req.valid.params.addressId, requestContext(req)),
  );
