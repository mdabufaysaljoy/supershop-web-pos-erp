import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';
import { getRedis } from './redis.js';

/**
 * Background jobs (BullMQ). Durable side effects (email, SMS, tracking, webhooks, exports,
 * translation…) are enqueued here — usually from an event subscriber — never run inline.
 * Job data must be small, JSON-serializable and hold IDs, not PII where avoidable
 * (load the record in the processor).
 */
export const QUEUE_NAMES = Object.freeze({
  EMAIL: 'email',
  SMS: 'sms',
  TRACKING: 'tracking',
  WEBHOOKS: 'webhooks',
  REPORTS: 'reports',
  EXPORTS: 'exports',
  IMPORTS: 'imports',
  TRANSLATION: 'translation',
});

const KNOWN_QUEUES = new Set(Object.values(QUEUE_NAMES));

/** Retries with exponential backoff (2s, 4s, 8s, 16s, 32s); bounded history in Redis. */
export const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 14 * 24 * 3600 },
});

const PREFIX = 'supershop';

/** @type {Map<string, Queue>} */
const queues = new Map();
/** @type {{ worker: Worker, connection: Redis }[]} */
const workers = [];

function assertQueueName(name) {
  if (!KNOWN_QUEUES.has(name)) throw new Error(`Unknown queue "${name}" — add it to QUEUE_NAMES`);
}

/** @param {string} name one of QUEUE_NAMES */
export function getQueue(name) {
  assertQueueName(name);
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: getRedis(),
      prefix: PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    q.on('error', (err) =>
      logger.error({ err: { message: err.message }, queue: name }, 'queue error'),
    );
    queues.set(name, q);
  }
  return q;
}

/**
 * Adds a job. Pass `opts.jobId` to make the enqueue idempotent (same id = enqueued once).
 * @param {string} queueName
 * @param {string} jobName
 * @param {object} data
 * @param {import('bullmq').JobsOptions} [opts]
 */
export function enqueue(queueName, jobName, data, opts) {
  return getQueue(queueName).add(jobName, data, opts);
}

/**
 * Starts a worker for a queue. Processors must be idempotent (jobs can be retried).
 * Each worker gets its own connection: workers block on Redis and require
 * `maxRetriesPerRequest: null`.
 * @param {string} queueName
 * @param {(job: import('bullmq').Job) => Promise<unknown>} processor
 * @param {{ concurrency?: number }} [opts]
 */
export function registerWorker(queueName, processor, { concurrency = 5 } = {}) {
  assertQueueName(queueName);
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName: `worker:${queueName}`,
  });
  const worker = new Worker(queueName, processor, { connection, prefix: PREFIX, concurrency });
  worker.on('failed', (job, err) =>
    // Never log job.data (may contain PII).
    logger.warn(
      {
        queue: queueName,
        jobId: job?.id,
        job: job?.name,
        attempt: job?.attemptsMade,
        err: { message: err.message },
      },
      'job failed',
    ),
  );
  worker.on('error', (err) =>
    logger.error({ err: { message: err.message }, queue: queueName }, 'worker error'),
  );
  workers.push({ worker, connection });
  return worker;
}

/** Graceful shutdown: let running jobs finish, then close queues. Shared Redis is closed by the caller. */
export async function closeQueues() {
  const ws = workers.splice(0);
  await Promise.allSettled(
    ws.map(async ({ worker, connection }) => {
      await worker.close();
      await connection.quit().catch(() => connection.disconnect());
    }),
  );
  const qs = [...queues.values()];
  queues.clear();
  await Promise.allSettled(qs.map((q) => q.close()));
}
