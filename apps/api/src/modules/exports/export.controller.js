import * as service from './export.service.js';

export async function createJob(req, res) {
  const data = await service.createExportJob({
    actor: req.access,
    input: req.valid.body,
  });
  res.status(202).json({ data });
}

export async function listJobs(req, res) {
  const result = await service.listExportJobs(req.access, req.valid.query);
  res.json(result);
}

export async function getJob(req, res) {
  const data = await service.getExportJob(req.params.id, req.access);
  res.json({ data });
}

export async function download(req, res) {
  const { buffer, fileName, contentType } = await service.downloadExportFile(
    req.params.id,
    req.access,
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

export async function getResources(req, res) {
  const data = service.getResourceDefinitions(req.access);
  res.json({ data });
}

export async function createPreset(req, res) {
  const data = await service.createReportPreset({
    actor: req.access,
    input: req.valid.body,
  });
  res.status(201).json({ data });
}

export async function listPresets(req, res) {
  const data = await service.listReportPresets({
    actor: req.access,
    resource: req.query?.resource,
  });
  res.json({ data });
}

export async function deletePreset(req, res) {
  const data = await service.deleteReportPreset({
    actor: req.access,
    id: req.params.id,
  });
  res.json({ data });
}
