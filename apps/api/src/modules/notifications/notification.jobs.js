import { enqueue, QUEUE_NAMES, registerWorker } from '../../core/queue.js';
import { logger } from '../../core/logger.js';
import { sendNotification } from './notification.service.js';

/**
 * Messages go out through BullMQ (D-013): an order must never wait for a mail server, and a
 * provider that is briefly down costs a retry, not a notification. Job data holds no secrets —
 * the token in an auth link is the exception and is why these jobs are removed quickly.
 */
export function queueNotification(input) {
  return enqueue(
    input.channel === 'sms' ? QUEUE_NAMES.SMS : QUEUE_NAMES.EMAIL,
    input.event,
    input,
    // One message per event per recipient: a replayed event does not send twice.
    { jobId: `${input.event}.${input.channel}.${input.dedupe ?? input.to}` },
  ).catch((err) => {
    // Redis down must not break the thing that happened (the order still exists).
    logger.error(
      { err: { message: err.message }, event: input.event, channel: input.channel },
      'notification could not be queued',
    );
  });
}

let started = false;

/** Started from server.js; tests call `sendNotification` directly instead. */
export function startNotificationWorkers() {
  if (started) return;
  started = true;
  const processor = (job) => sendNotification(job.data);
  registerWorker(QUEUE_NAMES.EMAIL, processor, { concurrency: 5 });
  registerWorker(QUEUE_NAMES.SMS, processor, { concurrency: 5 });
}
