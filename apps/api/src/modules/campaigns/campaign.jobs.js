import { enqueue, getQueue, QUEUE_NAMES, registerWorker, safeJobId } from '../../core/queue.js';
import { logger } from '../../core/logger.js';

let runner = null;
let customDispatcher = null;
let customCanceler = null;

export function setCampaignRunner(fn) {
  runner = fn;
}

export function setCampaignDispatcher(fn) {
  customDispatcher = fn;
}

export function setCampaignCanceler(fn) {
  customCanceler = fn;
}

/**
 * Enqueue a campaign dispatch job (immediate or delayed for scheduled campaigns).
 * @param {string} campaignId
 * @param {{ delay?: number, jobId?: string }} [opts]
 */
export async function queueCampaignDispatch(campaignId, { delay = 0, jobId } = {}) {
  if (customDispatcher) {
    return customDispatcher(campaignId, { delay, jobId });
  }

  const resolvedJobId = safeJobId(jobId ?? `campaign-${campaignId}`);
  return enqueue(
    QUEUE_NAMES.CAMPAIGNS,
    'dispatch',
    { campaignId },
    {
      jobId: resolvedJobId,
      delay: Math.max(0, delay),
    },
  ).catch((err) => {
    logger.error(
      { err: { message: err.message }, campaignId },
      'campaign dispatch could not be queued',
    );
    throw err;
  });
}

/**
 * Cancel a scheduled campaign job in the BullMQ queue.
 * @param {string} jobId
 */
export async function cancelCampaignJob(jobId) {
  if (!jobId) return false;
  if (customCanceler) {
    return customCanceler(jobId);
  }

  try {
    const q = getQueue(QUEUE_NAMES.CAMPAIGNS);
    const job = await q.getJob(safeJobId(jobId));
    if (job) {
      await job.remove();
      return true;
    }
  } catch (err) {
    logger.warn(
      { err: { message: err.message }, jobId },
      'could not remove scheduled campaign job',
    );
  }
  return false;
}

let started = false;

/**
 * Starts the BullMQ worker for the campaigns queue.
 */
export function startCampaignWorkers() {
  if (started) return;
  started = true;

  const processor = async (job) => {
    if (runner) {
      return runner(job.data.campaignId);
    }
    const { executeCampaignDispatch } = await import('./campaign.service.js');
    return executeCampaignDispatch(job.data.campaignId);
  };

  registerWorker(QUEUE_NAMES.CAMPAIGNS, processor, { concurrency: 2 });
}
