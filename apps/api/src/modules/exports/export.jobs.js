import { enqueue, QUEUE_NAMES, registerWorker } from '../../core/queue.js';
import * as repo from './export.repo.js';
import { processExportJob, setExportRunner } from './export.service.js';

const STALE_MS = 30 * 60 * 1000;

/**
 * Wires export jobs to BullMQ and registers the background worker.
 */
export async function startExportWorkers() {
  setExportRunner((jobId) =>
    enqueue(
      QUEUE_NAMES.EXPORTS,
      'universal-export',
      { jobId },
      {
        jobId: `export-${jobId}`,
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    ),
  );

  // Mark stale jobs interrupted by past server crashes
  await repo.failStaleJobs(new Date(Date.now() - STALE_MS));

  const processor = (job) => processExportJob(job.data.jobId);
  registerWorker(QUEUE_NAMES.EXPORTS, processor, { concurrency: 2 });
}
