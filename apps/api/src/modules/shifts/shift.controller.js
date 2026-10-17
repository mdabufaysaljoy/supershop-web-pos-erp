import { sendCreated, sendData } from '../../core/http.js';
import * as service from './shift.service.js';

/**
 * Shifts HTTP handlers (P6.5).
 */
export async function list(req, res) {
  const { data, meta } = await service.listShifts(req.access, req.valid.query);
  return sendData(res, data, { meta });
}

export async function current(req, res) {
  return sendData(res, await service.getCurrentShift(req.access, req.valid.query));
}

export async function getOne(req, res) {
  return sendData(res, await service.getShift(req.access, req.valid.params.id));
}

export async function open(req, res) {
  return sendCreated(res, await service.openShift(req.access, req.valid.body));
}

export async function recordMovement(req, res) {
  return sendData(
    res,
    await service.recordCashMovement(req.access, req.valid.params.id, req.valid.body),
  );
}

export async function close(req, res) {
  return sendData(res, await service.closeShift(req.access, req.valid.params.id, req.valid.body));
}

export async function xReport(req, res) {
  return sendData(res, await service.getXReport(req.access, req.valid.params.id));
}

export async function zReport(req, res) {
  return sendData(res, await service.getZReport(req.access, req.valid.params.id));
}

export async function printReport(req, res) {
  return sendData(
    res,
    await service.printShiftReport(req.access, req.valid.params.id, req.valid.body),
  );
}

export async function kickDrawer(req, res) {
  return sendData(res, await service.kickCashDrawer(req.access, req.valid.body));
}
