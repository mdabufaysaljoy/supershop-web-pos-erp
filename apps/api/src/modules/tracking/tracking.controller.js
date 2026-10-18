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
