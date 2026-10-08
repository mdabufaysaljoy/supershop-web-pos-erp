import { createApp } from './app.js';
import { config } from './core/config.js';
import { connectDb, disconnectDb } from './core/db.js';
import { logger } from './core/logger.js';
import { closeQueues } from './core/queue.js';
import { closeRedis } from './core/redis.js';

/**
 * Process entry point: connect dependencies → listen → graceful shutdown on SIGINT/SIGTERM.
 * Invalid env throws ConfigError at import (fail fast, before any connection is opened).
 */
const SHUTDOWN_TIMEOUT_MS = 15_000;

async function main() {
  await connectDb();

  const app = createApp();
  const server = app.listen(config.API_PORT, () => {
    logger.info({ port: config.API_PORT, env: config.NODE_ENV }, 'api listening');
  });
  // Slightly above typical proxy keep-alive (Nginx 75s) to avoid 502s on reused sockets.
  server.keepAliveTimeout = 76_000;
  server.headersTimeout = 77_000;

  let shuttingDown = false;
  async function shutdown(reason, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutting down');
    setTimeout(() => {
      logger.error('forced exit: shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    await new Promise((resolve) => server.close(resolve));
    await closeQueues();
    await closeRedis();
    await disconnectDb();
    logger.info('shutdown complete');
    process.exit(exitCode);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandledRejection');
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    shutdown('uncaughtException', 1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
