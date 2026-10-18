import { ExportJob, ReportPreset } from './export.model.js';

export const createJob = (data, { session } = {}) =>
  ExportJob.create([data], { session }).then(([doc]) => doc.toObject());

export const findJobById = (id) => ExportJob.findById(id).lean();

export async function listJobs({ staffId, resource, status, limit = 20, skip = 0 }) {
  const filter = {};
  if (staffId) filter.createdBy = staffId;
  if (resource) filter.resource = resource;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    ExportJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ExportJob.countDocuments(filter),
  ]);
  return { items, total };
}

/**
 * Claim job atomically so each job runs only once.
 */
export const claimJob = (id) =>
  ExportJob.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();

export const updateJob = (id, patch) =>
  ExportJob.findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after' }).lean();

export const failStaleJobs = (staleBefore) =>
  ExportJob.updateMany(
    { status: 'running', startedAt: { $lt: staleBefore } },
    { $set: { status: 'failed', failure: 'export.failure.stale', finishedAt: new Date() } },
  );

export const findExpiredJobs = (now = new Date()) =>
  ExportJob.find({ expiresAt: { $lt: now } }).lean();

export const deleteJob = (id) => ExportJob.findByIdAndDelete(id).lean();

// ------------------------------------------------------------- Report Presets

export const createPreset = (data) => ReportPreset.create(data).then((doc) => doc.toObject());

export async function listPresets({ staffId, resource }) {
  const filter = {};
  if (staffId) filter.createdBy = staffId;
  if (resource) filter.resource = resource;
  return ReportPreset.find(filter).sort({ name: 1 }).lean();
}

export const findPresetById = (id) => ReportPreset.findById(id).lean();

export const deletePreset = (id, staffId) =>
  ReportPreset.findOneAndDelete({ _id: id, ...(staffId && { createdBy: staffId }) }).lean();
