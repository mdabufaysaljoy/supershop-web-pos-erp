import { randomBytes } from 'node:crypto';
import { createProductSchemas, ERROR_CODES, EVENTS, PERMISSIONS as P } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { getPrivateStorage } from '../../adapters/storage/index.js';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { listAllBrands } from '../brands/index.js';
import { listCategories } from '../categories/index.js';
import { listDefinitions } from '../customFields/index.js';
import {
  createProduct,
  findProductBySlug,
  iterateProducts,
  updateProduct,
} from '../products/index.js';
import { resolveStaffAccess } from '../staff/index.js';
import { listAllSuppliers } from '../suppliers/index.js';
import {
  buildProductInput,
  columnsFor,
  COLUMN_NOTES,
  CF_PREFIX,
  exampleRows,
  groupRows,
  locate,
  PRODUCT_COLUMNS,
  productRows,
  VARIANT_COLUMNS,
} from './columns.js';
import {
  detectFormat,
  FORMATS,
  readTable,
  UnsupportedFileError,
  writeTable,
} from './spreadsheet.js';
import * as repo from './transfer.repo.js';

/**
 * Product bulk import/export (P1.7). Uploads are validated and stored privately, then processed
 * by a background job (BullMQ in production; inline runner in tests). Each product is written
 * through the products module (same validation, transactions, events and audit as the editor),
 * as the staff member who started the job, with their CURRENT permissions.
 */

export const LIMITS = Object.freeze({
  maxFileMb: 10,
  maxRows: 10_000,
  maxColumns: 100,
  maxReportedErrors: 500,
  resultTtlMs: 24 * 3600 * 1000,
});
const schemas = createProductSchemas();
const unsupported = () =>
  new AppError(ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 'Upload a CSV or XLSX file', { status: 415 });
const keyFor = (kind, ext) => {
  const d = new Date();
  return `${kind}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(16).toString('hex')}.${ext}`;
};

/**
 * Runs a job `(jobId, type)`: BullMQ by default (set in transfer.jobs.js); tests run it inline.
 */
let runner = async () => {
  throw new Error('Transfer runner not configured');
};
export function setTransferRunner(fn) {
  runner = fn;
}

export const toJobDto = (j, { withErrors = false } = {}) => ({
  id: String(j._id),
  type: j.type,
  status: j.status,
  format: j.format,
  fileName: j.fileName,
  mode: j.mode,
  dryRun: j.dryRun,
  counts: j.counts,
  errorCount: j.errorCount,
  ignoredColumns: j.ignoredColumns ?? [],
  failure: j.failure,
  downloadable:
    j.type === 'export' && j.status === 'done' && Boolean(j.resultKey) && j.expiresAt > new Date(),
  createdAt: j.createdAt,
  startedAt: j.startedAt,
  finishedAt: j.finishedAt,
  expiresAt: j.expiresAt,
  ...(withErrors && { errors: j.report ?? [] }),
});

/** Removes expired jobs and their files (best-effort; runs before each new job). */
export async function cleanupExpired(now = new Date()) {
  try {
    const expired = await repo.findExpired(now);
    const storage = getPrivateStorage();
    for (const j of expired) {
      for (const key of [j.fileKey, j.resultKey].filter(Boolean)) await storage.delete(key);
    }
    if (expired.length) await repo.deleteJobs(expired.map((j) => j._id));
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'transfer cleanup failed');
  }
}

// ---------------------------------------------------------------- template

/** Template with the current columns (custom fields, cost if permitted) and example rows. */
export async function buildTemplate(actor, format) {
  const defs = await listDefinitions('product');
  const columns = columnsFor({ defs, canViewCost: actor.can(P.PRODUCT_VIEW_COST) });
  const body = await writeTable(format, columns, exampleRows(columns), { notes: COLUMN_NOTES });
  return {
    body,
    contentType: FORMATS[format].contentType,
    fileName: `products-template.${format}`,
  };
}

// ---------------------------------------------------------------- jobs: start

/**
 * @param {object} actor
 * @param {{ buffer: Buffer, originalName?: string }} file
 * @param {{ mode: 'upsert' | 'create', dryRun: boolean }} opts
 */
export async function startImport(actor, file, { mode, dryRun }) {
  if (!file?.buffer?.length) throw new BadRequestError('A file is required');
  const format = detectFormat(file.buffer);
  if (!format) throw unsupported();
  await cleanupExpired();
  const fileKey = keyFor('imports', format);
  await getPrivateStorage().put(fileKey, file.buffer, { contentType: FORMATS[format].contentType });
  const job = await repo.createJob({
    type: 'import',
    format,
    fileName:
      String(file.originalName ?? '')
        .split(/[\\/]/)
        .pop()
        .slice(0, 200) || null,
    mode,
    dryRun,
    createdBy: actor.staffId,
    fileKey,
    expiresAt: new Date(Date.now() + LIMITS.resultTtlMs),
  });
  await dispatch(job);
  return toJobDto(job);
}

/** Hands the job to the runner; a queue outage fails the job instead of leaving it 'queued'. */
async function dispatch(job) {
  try {
    await runner(String(job._id), job.type);
  } catch (err) {
    logger.error(
      { err: { message: err.message }, jobId: String(job._id) },
      'could not queue transfer',
    );
    await repo.updateJob(job._id, {
      status: 'failed',
      failure: 'transfer.failure.unexpected',
      finishedAt: new Date(),
    });
    throw new ServiceUnavailableError('Background jobs are unavailable, try again shortly');
  }
}

export async function startExport(actor, { format, filters }) {
  await cleanupExpired();
  const job = await repo.createJob({
    type: 'export',
    format,
    filters,
    createdBy: actor.staffId,
    expiresAt: new Date(Date.now() + LIMITS.resultTtlMs),
  });
  await dispatch(job);
  return toJobDto(job);
}

// ---------------------------------------------------------------- jobs: read

function assertOwner(actor, job) {
  if (!job) throw new NotFoundError('Job not found');
  if (String(job.createdBy) !== actor.staffId && !actor.isSuperAdmin)
    throw new NotFoundError('Job not found');
}

export async function getJob(actor, id) {
  const job = await repo.findJob(id);
  assertOwner(actor, job);
  return toJobDto(job, { withErrors: true });
}

export const listJobs = async (actor, type) =>
  (await repo.listJobsOf(actor.staffId, type)).map((j) => toJobDto(j));

/** Export file for its creator only (it may contain cost prices they are allowed to see). */
export async function downloadExport(actor, id) {
  const job = await repo.findJob(id);
  if (!job || job.type !== 'export' || String(job.createdBy) !== actor.staffId) {
    throw new NotFoundError('Export not found');
  }
  if (job.status !== 'done' || !job.resultKey || job.expiresAt <= new Date()) {
    throw new AppError(ERROR_CODES.GONE, 'Export expired or not ready', { status: 410 });
  }
  const body = await getPrivateStorage().get(job.resultKey);
  if (!body) throw new AppError(ERROR_CODES.GONE, 'Export file missing', { status: 410 });
  const date = job.finishedAt.toISOString().slice(0, 10);
  return {
    body,
    contentType: FORMATS[job.format].contentType,
    fileName: `products-${date}.${job.format}`,
  };
}

// ---------------------------------------------------------------- jobs: run (worker)

/** Lookup maps for names/slugs used in files. */
async function lookups() {
  const [categories, brands, suppliers, defs] = await Promise.all([
    listCategories(),
    listAllBrands(),
    listAllSuppliers(),
    listDefinitions('product'),
  ]);
  const brandsByKey = new Map();
  for (const b of brands) {
    brandsByKey.set(b.name.toLowerCase(), b.id);
    brandsByKey.set(b.slug, b.id);
  }
  return {
    categoriesBySlug: new Map(categories.map((c) => [c.slug, c.id])),
    categorySlugs: new Map(categories.map((c) => [c.id, c.slug])),
    brandsByKey,
    brandNames: new Map(brands.map((b) => [b.id, b.name])),
    suppliersByKey: new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id])),
    supplierNames: new Map(suppliers.map((s) => [s.id, s.name])),
    defs,
  };
}

/** Error thrown by the products module → report rows. */
function errorsFrom(err, where) {
  const details = err?.details;
  if (Array.isArray(details) && details.length) {
    return details.map((d) => ({ ...locate(d.path, where), message: d.message ?? V.INVALID_TYPE }));
  }
  if (err?.code && err.status && err.status < 500) {
    return [{ ...locate('', where), message: `errors.${err.code}` }];
  }
  throw err; // unexpected → job fails (logged)
}

async function runImport(job, actor) {
  if (!actor.can(P.PRODUCT_IMPORT)) throw new ForbiddenError('Missing permission product.import');
  const storage = getPrivateStorage();
  const buf = await storage.get(job.fileKey);
  if (!buf) throw new AppError(ERROR_CODES.GONE, 'Upload missing', { status: 410 });
  let table;
  try {
    table = await readTable(buf, LIMITS);
  } catch (err) {
    if (err instanceof RangeError) return { failure: 'transfer.failure.tooManyRows' };
    if (err instanceof UnsupportedFileError || err.name === 'CsvError')
      return { failure: 'transfer.failure.unreadable' };
    throw err;
  }
  const ctx = await lookups();
  const known = new Set([
    ...PRODUCT_COLUMNS,
    ...VARIANT_COLUMNS,
    ...ctx.defs.filter((d) => d.isActive).map((d) => `${CF_PREFIX}${d.key}`),
  ]);
  const present = new Set(table.headers.filter((h) => known.has(h)));
  const ignoredColumns = table.headers.filter((h) => h && !known.has(h));
  if (!present.has('product_key') || !present.has('sku'))
    return { failure: 'transfer.failure.missingColumns', ignoredColumns };

  const { groups, errors } = groupRows(table.headers, table.rows);
  const counts = {
    rows: table.rows.length,
    products: groups.size,
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
  };
  const canViewCost = actor.can(P.PRODUCT_VIEW_COST);
  if (present.has('cost') && !canViewCost) ignoredColumns.push('cost');
  const failedProduct = (list) => {
    counts.failed += 1;
    errors.push(...list);
  };

  for (const [key, group] of groups) {
    const firstLine = group[0].line;
    try {
      const existing = await findProductBySlug(actor, key);
      if (existing && job.mode === 'create') {
        failedProduct([{ row: firstLine, column: 'product_key', message: V.ALREADY_EXISTS }]);
        continue;
      }
      if (existing && !actor.can(P.PRODUCT_UPDATE)) {
        failedProduct([{ row: firstLine, column: 'product_key', message: 'errors.FORBIDDEN' }]);
        continue;
      }
      const built = buildProductInput(key, group, {
        ...ctx,
        existing,
        canViewCost,
        hasColumn: (c) => present.has(c),
      });
      const where = { firstLine, variantLines: built.variantLines };
      if (built.errors.length) {
        failedProduct(built.errors);
        continue;
      }
      const parsed = (existing ? schemas.update : schemas.create).safeParse(built.input);
      if (!parsed.success) {
        failedProduct(
          parsed.error.issues.map((i) => ({
            ...locate(i.path.join('.'), where),
            message: i.message,
          })),
        );
        continue;
      }
      try {
        if (existing) await updateProduct(actor, existing.id, parsed.data, { dryRun: job.dryRun });
        else await createProduct(actor, parsed.data, { dryRun: job.dryRun });
        counts[existing ? 'updated' : 'created'] += 1;
      } catch (err) {
        failedProduct(errorsFrom(err, where));
      }
    } finally {
      counts.processed += 1;
      if (counts.processed % 25 === 0) await repo.updateJob(job._id, { counts });
    }
  }
  return { counts, errors, ignoredColumns };
}

async function runExport(job, actor) {
  if (!actor.can(P.PRODUCT_EXPORT)) throw new ForbiddenError('Missing permission product.export');
  const ctx = await lookups();
  const columns = columnsFor({ defs: ctx.defs, canViewCost: actor.can(P.PRODUCT_VIEW_COST) });
  const rows = [];
  const counts = { rows: 0, products: 0, processed: 0, created: 0, updated: 0, failed: 0 };
  for await (const p of iterateProducts(actor, job.filters ?? {})) {
    rows.push(...productRows(p, { ...ctx, columns }));
    counts.products += 1;
    if (rows.length > LIMITS.maxRows * 5) return { failure: 'transfer.failure.tooManyRows' };
  }
  counts.rows = rows.length;
  counts.processed = counts.products;
  const body = await writeTable(job.format, columns, rows);
  const resultKey = keyFor('exports', job.format);
  await getPrivateStorage().put(resultKey, body, { contentType: FORMATS[job.format].contentType });
  return { counts, resultKey };
}

/**
 * Worker entry point (idempotent: a job runs once — it's claimed atomically).
 * @param {string} jobId
 */
export async function processTransferJob(jobId) {
  const job = await repo.claimJob(jobId);
  if (!job) return; // already running/finished
  let outcome;
  try {
    const actor = await resolveStaffAccess(String(job.createdBy));
    if (!actor) outcome = { failure: 'transfer.failure.staffInactive' };
    else
      outcome = job.type === 'import' ? await runImport(job, actor) : await runExport(job, actor);
  } catch (err) {
    logger.error(
      { err: { message: err.message }, jobId, type: job.type },
      'product transfer failed',
    );
    outcome = {
      failure: err instanceof ForbiddenError ? 'errors.FORBIDDEN' : 'transfer.failure.unexpected',
    };
  }
  const errors = outcome.errors ?? [];
  const done = await repo.updateJob(job._id, {
    status: outcome.failure ? 'failed' : 'done',
    failure: outcome.failure ?? null,
    ...(outcome.counts && { counts: outcome.counts }),
    report: errors.slice(0, LIMITS.maxReportedErrors),
    errorCount: errors.length,
    ignoredColumns: outcome.ignoredColumns ?? [],
    ...(outcome.resultKey && { resultKey: outcome.resultKey }),
    finishedAt: new Date(),
  });
  if (job.fileKey)
    await getPrivateStorage()
      .delete(job.fileKey)
      .catch(() => {});
  void eventBus.emit(
    job.type === 'import' ? EVENTS.PRODUCT_IMPORT_FINISHED : EVENTS.PRODUCT_EXPORT_FINISHED,
    {
      jobId: String(job._id),
      actorId: String(job.createdBy),
      status: done.status,
      dryRun: job.dryRun,
      counts: done.counts,
      errorCount: done.errorCount,
    },
  );
}
