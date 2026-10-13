import { TransferJob } from './transfer.model.js';

export const createJob = (data) => TransferJob.create(data).then((d) => d.toObject());
export const findJob = (id) => TransferJob.findById(id).lean();
export const listJobsOf = (createdBy, type, limit = 20) =>
  TransferJob.find({ createdBy, ...(type && { type }) }, { report: 0 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
export const updateJob = (id, set) =>
  TransferJob.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after', lean: true });
/** Atomically claims a queued job (a retried/duplicate delivery can't run it twice). */
export const claimJob = (id) =>
  TransferJob.findOneAndUpdate(
    { _id: id, status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
    { returnDocument: 'after', lean: true },
  );
export const findExpired = (now) => TransferJob.find({ expiresAt: { $lte: now } }).lean();
export const deleteJobs = (ids) => TransferJob.deleteMany({ _id: { $in: ids } });
/** Jobs left 'running' by a crashed process. */
export const failStale = (before) =>
  TransferJob.updateMany(
    { status: { $in: ['running', 'queued'] }, updatedAt: { $lte: before } },
    { $set: { status: 'failed', failure: 'transfer.failure.interrupted', finishedAt: new Date() } },
  );
