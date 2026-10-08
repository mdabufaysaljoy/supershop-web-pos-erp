import { randomUUID } from 'node:crypto';
import { isEventName } from '@supershop/shared';
import { logger as rootLogger } from './logger.js';

/**
 * In-process domain event bus (CLAUDE.md §2.2): services emit, other modules subscribe.
 *
 * Rules:
 * - Emit AFTER the transaction commits (never inside `withTransaction`), so subscribers never see
 *   rolled-back state.
 * - Payloads are plain JSON (ids, amounts, snapshots) — not mongoose documents.
 * - A subscriber failure never affects the emitter or other subscribers; it is logged.
 * - Subscribers are in-memory: anything that must survive a crash/restart (email, tracking,
 *   webhooks…) should just enqueue a BullMQ job (core/queue.js) and return.
 *
 * Names must come from the shared registry: `eventBus.emit(EVENTS.ORDER_PAID, …)`. Unknown names
 * throw, so a typo fails loudly instead of silently reaching no subscriber.
 */

/**
 * @typedef {{ id: string, name: string, occurredAt: string, payload: unknown, meta: Record<string, unknown> }} DomainEvent
 * @typedef {(event: DomainEvent) => unknown | Promise<unknown>} EventHandler
 */

export function createEventBus({ logger = rootLogger } = {}) {
  /** @type {Map<string, Set<EventHandler>>} */
  const handlers = new Map();

  const assertName = (name) => {
    if (!isEventName(name)) {
      throw new Error(`Unknown event "${name}" — add it to EVENTS in @supershop/shared`);
    }
  };

  /**
   * Subscribes a handler. Returns an unsubscribe function.
   * @param {string} name
   * @param {EventHandler} handler
   */
  function on(name, handler) {
    assertName(name);
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(handler);
    return () => handlers.get(name)?.delete(handler);
  }

  /**
   * Publishes an event. Handlers run asynchronously after the current tick, so the caller is
   * never blocked or broken by them. The returned promise resolves when all handlers have
   * settled (useful in tests; production code normally does not await it). Never rejects.
   * @param {string} name
   * @param {unknown} payload
   * @param {Record<string, unknown>} [meta]  e.g. { requestId, actorId, branchId }
   * @returns {Promise<DomainEvent>}
   */
  function emit(name, payload, meta = {}) {
    assertName(name);
    const event = Object.freeze({
      id: randomUUID(),
      name,
      occurredAt: new Date().toISOString(),
      payload,
      meta: Object.freeze({ ...meta }),
    });
    const subs = [...(handlers.get(name) ?? [])];

    return new Promise((resolve) => {
      setImmediate(async () => {
        await Promise.all(
          subs.map(async (handler) => {
            try {
              await handler(event);
            } catch (err) {
              logger.error(
                { err, event: { id: event.id, name }, handler: handler.name || 'anonymous' },
                'event subscriber failed',
              );
            }
          }),
        );
        resolve(event);
      });
    });
  }

  const listenerCount = (name) => handlers.get(name)?.size ?? 0;
  const clear = () => handlers.clear();

  return { on, emit, listenerCount, clear };
}

/** Process-wide bus. Modules register subscribers from their `<feature>.events.js`. */
export const eventBus = createEventBus();
