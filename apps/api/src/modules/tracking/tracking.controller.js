import * as service from './tracking.service.js';

export async function getPublicConfig(req, res) {
  const data = await service.getPublicTrackingConfig();
  res.json({ data });
}

export async function getAdminIntegrations(req, res) {
  const data = await service.getAdminIntegrations();
  res.json({ data });
}

export async function updateIntegration(req, res) {
  const data = await service.updateIntegration(req.access, req.params.provider, req.valid.body);
  res.json({ data });
}

export async function updateConsentSettings(req, res) {
  const data = await service.updateConsentSettings(req.access, req.valid.body);
  res.json({ data });
}

export async function queryTrackingLogs(req, res) {
  const data = await service.queryTrackingLogs(req.valid.query);
  res.json({ data });
}

export async function getTrackingLog(req, res) {
  const data = await service.getTrackingLog(req.params.id);
  res.json({ data });
}

export async function retryTrackingLog(req, res) {
  const data = await service.retryTrackingLog(req.params.id);
  res.json({ data });
}

export async function dispatchTestEvent(req, res) {
  const data = await service.dispatchTestEvent(req.valid.body);
  res.json({ data });
}

export async function ingestServerEvent(req, res) {
  const data = await service.ingestServerEvent(req.valid.body);
  res.status(202).json({ data });
}
