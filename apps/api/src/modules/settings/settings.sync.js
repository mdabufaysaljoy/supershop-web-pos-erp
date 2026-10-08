import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { getRedis } from '../../core/redis.js';
import { loadSettings, setChangePublisher } from './settings.service.js';

/**
 * Keeps every API process's settings cache fresh:
 * - on update, the writer publishes on a Redis channel; peers reload immediately;
 * - a periodic reload covers missed messages (Redis restart, network blip).
 * Started from server.js after the DB connects; not used in tests.
 */
const CHANNEL = 'supershop:settings:changed';
const RELOAD_INTERVAL_MS = 60_000;
const ORIGIN = `${process.pid}-${Math.random().toString(36).slice(2)}`;

let subscriber;
let timer;

async function reload(reason) {
  try {
    await loadSettings();
  } catch (err) {
    logger.error(
      { err: { message: err.message }, reason },
      'settings reload failed (keeping last values)',
    );
  }
}

export async function startSettingsSync() {
  if (config.isTest || subscriber) return;
  setChangePublisher((keys) =>
    getRedis().publish(CHANNEL, JSON.stringify({ origin: ORIGIN, keys })),
  );

  subscriber = getRedis().duplicate({ connectionName: 'settings-sub' });
  subscriber.on('error', (err) =>
    logger.error({ err: { message: err.message } }, 'settings subscriber error'),
  );
  subscriber.on('message', (_channel, raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.origin !== ORIGIN) void reload('peer-change');
  });
  await subscriber
    .subscribe(CHANNEL)
    .catch((err) =>
      logger.warn(
        { err: { message: err.message } },
        'settings subscribe failed; relying on periodic reload',
      ),
    );

  timer = setInterval(() => void reload('interval'), RELOAD_INTERVAL_MS);
  timer.unref();
}

export async function stopSettingsSync() {
  clearInterval(timer);
  timer = undefined;
  const s = subscriber;
  subscriber = undefined;
  await s?.quit().catch(() => s.disconnect());
}
