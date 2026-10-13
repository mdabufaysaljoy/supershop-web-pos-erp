import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

// Reject filter keys that are not in the schema instead of silently matching everything.
mongoose.set('strictQuery', true);

/**
 * Connects the default mongoose connection. Requires a replica set (transactions, CLAUDE.md §2.5);
 * dev uses the single-node replset from docker-compose.yml.
 * @param {string} [uri]
 */
export async function connectDb(uri = config.MONGO_URI) {
  const conn = mongoose.connection;
  conn.on('disconnected', () => logger.warn('mongo disconnected'));
  conn.on('reconnected', () => logger.info('mongo reconnected'));
  conn.on('error', (err) => logger.error({ err }, 'mongo connection error'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });
  logger.info({ db: conn.name }, 'mongo connected');
  return conn;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export const isDbReady = () => mongoose.connection.readyState === 1;

/**
 * Runs `fn(session)` in a Mongo transaction with automatic retry on transient errors.
 * Pass `session` to EVERY read/write inside `fn`. `fn` may run more than once on retry, so it must
 * not have external side effects — emit events / enqueue jobs AFTER this resolves.
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withTransaction(fn) {
  return mongoose.connection.transaction(fn, {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
}
