import { enqueue, QUEUE_NAMES, registerWorker } from '../../core/queue.js';
import * as repo from './transfer.repo.js';
import { processTransferJob, setTransferRunner } from './transfer.service.js';

const STALE_MS = 30 * 60 * 1000;

/**
 * Wires product import/export jobs to BullMQ and starts the workers (called from server.js).
 * Imports run one at a time (they write many products); no automatic retry — a job is claimed
 * once and its report says exactly what was written.
 */
export async function startTransferWorkers() {
  setTransferRunner((jobId, type) =>
    enqueue(
      type === 'import' ? QUEUE_NAMES.IMPORTS : QUEUE_NAMES.EXPORTS,
      'products',
      { jobId },
      {
        jobId: `transfer-${jobId}`,
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    ),
  );
  // Jobs interrupted by a crash/restart long ago are reported as failed, not left "running".
  await repo.failStale(new Date(Date.now() - STALE_MS));
  const processor = (job) => processTransferJob(job.data.jobId);
  registerWorker(QUEUE_NAMES.IMPORTS, processor, { concurrency: 1 });
  registerWorker(QUEUE_NAMES.EXPORTS, processor, { concurrency: 2 });
}
