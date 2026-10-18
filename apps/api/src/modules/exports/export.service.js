import { randomBytes } from 'node:crypto';
import {
  filterPermittedColumns,
  getDefaultColumns,
  EVENTS,
  RESOURCE_COLUMNS,
} from '@supershop/shared';
import { getPrivateStorage } from '../../adapters/storage/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { resolveStaffAccess } from '../staff/index.js';
import * as repo from './export.repo.js';
import { checkResourcePermission, getExportData } from './registry.js';
import { EXPORT_MIME_TYPES, serializeExport } from './serializer.js';

export const LIMITS = Object.freeze({
  maxRows: 50_000,
  resultTtlMs: 24 * 3600 * 1000, // 24 hours
});

const keyFor = (resource, ext) => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const rand = randomBytes(16).toString('hex');
  return `exports/${resource}/${y}/${m}/${rand}.${ext}`;
};

/**
 * Runner function for background jobs (BullMQ in prod; inline in tests).
 */
let runner = async () => {
  throw new Error('Export runner not configured');
};
export function setExportRunner(fn) {
  runner = fn;
}

export const toJobDto = (j) => ({
  id: String(j._id),
  resource: j.resource,
  format: j.format,
  status: j.status,
  title: j.title ?? null,
  fileName: j.fileName,
  columns: j.columns ?? [],
  filters: j.filters ?? {},
  fileSize: j.fileSize ?? 0,
  counts: j.counts ?? { rows: 0, processed: 0, failed: 0 },
  failure: j.failure ?? null,
  downloadable: j.status === 'done' && Boolean(j.resultKey) && new Date(j.expiresAt) > new Date(),
  createdAt: j.createdAt,
  startedAt: j.startedAt ?? null,
  finishedAt: j.finishedAt ?? null,
  expiresAt: j.expiresAt,
});

/**
 * Initiates a universal export job.
 */
export async function createExportJob({ actor, input }) {
  checkResourcePermission(actor, input.resource);

  const available =
    input.columns && input.columns.length ? input.columns : getDefaultColumns(input.resource);
  const permitted = filterPermittedColumns(input.resource, available, actor.can.bind(actor));

  if (!permitted.length) {
    throw new BadRequestError('No valid or permitted columns selected for export');
  }

  const d = new Date().toISOString().slice(0, 10);
  const baseName = (input.title || input.resource).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fileName = `${baseName}_${d}.${input.format}`;
  const expiresAt = new Date(Date.now() + LIMITS.resultTtlMs);

  const job = await repo.createJob({
    resource: input.resource,
    format: input.format,
    status: 'queued',
    title: input.title ?? null,
    columns: permitted,
    filters: input.filters ?? {},
    sort: input.sort ?? null,
    fileName,
    createdBy: actor.staffId,
    expiresAt,
  });

  // Schedule or trigger background processing
  try {
    await runner(String(job._id));
  } catch (err) {
    logger.error({ err: { message: err.message }, jobId: job._id }, 'failed to queue export job');
  }

  return toJobDto(job);
}

/**
 * Worker processor: claims job, fetches dataset, formats table, and saves to private storage.
 */
export async function processExportJob(jobId) {
  const job = await repo.claimJob(jobId);
  if (!job) return; // already processed or running

  try {
    const actor = await resolveStaffAccess(String(job.createdBy));
    if (!actor) {
      await repo.updateJob(job._id, {
        status: 'failed',
        failure: 'export.failure.staffInactive',
        finishedAt: new Date(),
      });
      return;
    }

    const { headers, keys, rows } = await getExportData({
      actor,
      resource: job.resource,
      columns: job.columns,
      filters: job.filters,
    });

    const buffer = await serializeExport({
      format: job.format,
      headers,
      keys,
      rows,
      title: job.title || job.resource,
    });

    const resultKey = keyFor(job.resource, job.format);
    await getPrivateStorage().put(resultKey, buffer, {
      contentType: EXPORT_MIME_TYPES[job.format],
    });

    const done = await repo.updateJob(job._id, {
      status: 'done',
      resultKey,
      fileSize: buffer.length,
      counts: { rows: rows.length, processed: rows.length, failed: 0 },
      finishedAt: new Date(),
    });

    void eventBus.emit(EVENTS.EXPORT_FINISHED, {
      jobId: String(done._id),
      actorId: String(job.createdBy),
      resource: job.resource,
      format: job.format,
      status: 'done',
      counts: done.counts,
    });
  } catch (err) {
    logger.error(
      { err: { message: err.message, stack: err.stack }, jobId },
      'export job processing failed',
    );

    await repo.updateJob(job._id, {
      status: 'failed',
      failure: err.message || 'export.failure.unexpected',
      finishedAt: new Date(),
    });

    void eventBus.emit(EVENTS.EXPORT_FINISHED, {
      jobId: String(job._id),
      actorId: String(job.createdBy),
      resource: job.resource,
      format: job.format,
      status: 'failed',
      failure: err.message,
    });
  }
}

/**
 * Retrieves a single export job.
 */
export async function getExportJob(id, actor) {
  const job = await repo.findJobById(id);
  if (!job) throw new NotFoundError('Export job not found');

  if (!actor.isSuperAdmin && String(job.createdBy) !== String(actor.staffId)) {
    throw new ForbiddenError('Cannot view export jobs created by another user');
  }

  return toJobDto(job);
}

/**
 * Lists export jobs for the current staff.
 */
export async function listExportJobs(actor, query = {}) {
  const { page = 1, limit = 20, resource, status } = query;
  const staffId = actor.isSuperAdmin ? query.staffId || null : actor.staffId;

  const { items, total } = await repo.listJobs({
    staffId,
    resource,
    status,
    limit,
    skip: (page - 1) * limit,
  });

  return {
    data: items.map(toJobDto),
    meta: { page, limit, total },
  };
}

/**
 * Retrieves file buffer for download.
 */
export async function downloadExportFile(id, actor) {
  const job = await repo.findJobById(id);
  if (!job) throw new NotFoundError('Export job not found');

  if (!actor.isSuperAdmin && String(job.createdBy) !== String(actor.staffId)) {
    throw new ForbiddenError('Cannot download exports created by another user');
  }

  if (job.status !== 'done' || !job.resultKey) {
    throw new BadRequestError('Export file is not ready for download');
  }

  if (new Date(job.expiresAt) <= new Date()) {
    throw new BadRequestError('Export download link has expired');
  }

  const buffer = await getPrivateStorage().get(job.resultKey);
  if (!buffer) {
    throw new NotFoundError('Export file was removed or missing from storage');
  }

  return {
    buffer,
    fileName: job.fileName,
    contentType: EXPORT_MIME_TYPES[job.format] || 'application/octet-stream',
  };
}

/**
 * Cleans up expired export jobs and their files.
 */
export async function cleanupExpiredExports(now = new Date()) {
  const expired = await repo.findExpiredJobs(now);
  for (const job of expired) {
    if (job.resultKey) {
      await getPrivateStorage()
        .delete(job.resultKey)
        .catch(() => {});
    }
    await repo.deleteJob(job._id).catch(() => {});
  }
}

// ------------------------------------------------------------- Report Presets

export async function createReportPreset({ actor, input }) {
  checkResourcePermission(actor, input.resource);

  const preset = await repo.createPreset({
    name: input.name,
    resource: input.resource,
    columns: input.columns,
    filters: input.filters ?? {},
    format: input.format ?? 'xlsx',
    sort: input.sort ?? null,
    createdBy: actor.staffId,
  });

  return {
    id: String(preset._id),
    name: preset.name,
    resource: preset.resource,
    columns: preset.columns,
    filters: preset.filters,
    format: preset.format,
    createdAt: preset.createdAt,
  };
}

export async function listReportPresets({ actor, resource }) {
  const items = await repo.listPresets({
    staffId: actor.isSuperAdmin ? null : actor.staffId,
    resource,
  });

  return items.map((p) => ({
    id: String(p._id),
    name: p.name,
    resource: p.resource,
    columns: p.columns,
    filters: p.filters,
    format: p.format,
    createdAt: p.createdAt,
  }));
}

export async function deleteReportPreset({ actor, id }) {
  const deleted = await repo.deletePreset(id, actor.isSuperAdmin ? null : actor.staffId);
  if (!deleted) throw new NotFoundError('Preset not found');
  return { success: true };
}

/**
 * Returns available exportable resources and column definitions for the UI.
 */
export function getResourceDefinitions(actor) {
  const resources = {};
  for (const [resKey, cols] of Object.entries(RESOURCE_COLUMNS)) {
    resources[resKey] = cols.map((col) => ({
      key: col.key,
      label: col.label,
      type: col.type,
      default: col.default,
      permitted: !col.permission || actor.can(col.permission),
    }));
  }
  return resources;
}
