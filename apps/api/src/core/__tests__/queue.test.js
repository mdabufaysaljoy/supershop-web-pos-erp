import { afterAll, describe, expect, it } from 'vitest';
import { closeQueues, enqueue, getQueue, QUEUE_NAMES, registerWorker } from '../queue.js';
import { closeRedis } from '../redis.js';

describe('queue name guard', () => {
  it('rejects unknown queues without touching Redis', () => {
    expect(() => getQueue('nope')).toThrow(/Unknown queue/);
    expect(() => registerWorker('nope', async () => {})).toThrow(/Unknown queue/);
  });
});

// Integration: needs a real Redis (CI service, or `TEST_REDIS_URL=redis://127.0.0.1:6379 npm test`).
describe.skipIf(!process.env.TEST_REDIS_URL)('queue (redis)', () => {
  afterAll(async () => {
    await getQueue(QUEUE_NAMES.REPORTS).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
  });

  it('processes an enqueued job, retries on failure, and dedupes by jobId', async () => {
    let attempts = 0;
    const done = new Promise((resolve) => {
      registerWorker(QUEUE_NAMES.REPORTS, async (job) => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        resolve(job.data);
        return 'ok';
      });
    });

    const opts = { jobId: `test-${Date.now()}`, backoff: { type: 'fixed', delay: 50 } };
    const job1 = await enqueue(QUEUE_NAMES.REPORTS, 'snapshot', { day: '2026-10-08' }, opts);
    const job2 = await enqueue(QUEUE_NAMES.REPORTS, 'snapshot', { day: '2026-10-08' }, opts);
    expect(job2.id).toBe(job1.id);

    await expect(done).resolves.toEqual({ day: '2026-10-08' });
    expect(attempts).toBe(2);
  });
});
