import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

/** @type {Redis | undefined} */
let client;

/**
 * Shared general-purpose Redis client (cache, rate limits, queue producers, health).
 * Fails fast (bounded retries per command) so an HTTP request never hangs when Redis is down.
 * BullMQ workers use their own blocking connections (see queue.js).
 */
export function getRedis() {
  if (!client) {
    client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
      connectionName: 'api',
    });
    client.on('error', (err) => logger.error({ err: { message: err.message } }, 'redis error'));
  }
  return client;
}

/** Health probe: resolves true if Redis answers PING within `timeoutMs`. */
export async function pingRedis(timeoutMs = 1_000) {
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const ping = getRedis()
      .ping()
      .then((r) => r === 'PONG')
      .catch(() => false);
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function closeRedis() {
  if (!client) return;
  const c = client;
  client = undefined;
  await c.quit().catch(() => c.disconnect());
}
