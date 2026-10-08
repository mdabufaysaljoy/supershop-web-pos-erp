/* eslint-disable no-console -- bootstrap logging until the pino logger lands in P0.2 */
import { createApp } from './app.js';

// Minimal bootstrap; replaced by zod-validated config + pino logger + graceful DB/queue
// shutdown in P0.2.
const port = Number(process.env.API_PORT) || 4000;
const app = createApp();

const server = app.listen(port, () => {
  console.info(`[api] listening on http://localhost:${port}`);
});

const shutdown = (signal) => {
  console.info(`[api] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
