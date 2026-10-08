import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../events.js';

const silentLogger = { error: vi.fn() };

describe('event bus', () => {
  it('delivers an immutable envelope to every subscriber, after the current tick', async () => {
    const bus = createEventBus({ logger: silentLogger });
    const seen = [];
    bus.on('order.paid', (e) => seen.push(['a', e]));
    bus.on('order.paid', (e) => seen.push(['b', e]));

    const done = bus.emit('order.paid', { orderId: '1', total: 11500 }, { requestId: 'r1' });
    expect(seen).toHaveLength(0); // emitter is never blocked by subscribers
    const event = await done;

    expect(seen.map(([n]) => n)).toEqual(['a', 'b']);
    expect(event).toMatchObject({
      name: 'order.paid',
      payload: { orderId: '1' },
      meta: { requestId: 'r1' },
    });
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('isolates subscriber failures (sync and async) and logs them', async () => {
    const logger = { error: vi.fn() };
    const bus = createEventBus({ logger });
    const ok = vi.fn();
    bus.on('stock.low', () => {
      throw new Error('sync boom');
    });
    bus.on('stock.low', async () => {
      throw new Error('async boom');
    });
    bus.on('stock.low', ok);

    await expect(bus.emit('stock.low', {})).resolves.toBeDefined();
    expect(ok).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('supports unsubscribe and validates names', async () => {
    const bus = createEventBus({ logger: silentLogger });
    const h = vi.fn();
    const off = bus.on('staff.created', h);
    expect(bus.listenerCount('staff.created')).toBe(1);
    off();
    await bus.emit('staff.created', {});
    expect(h).not.toHaveBeenCalled();
    expect(() => bus.on('BadName', h)).toThrow(/Unknown event/);
    expect(() => bus.emit('order', {})).toThrow(/Unknown event/);
    expect(() => bus.emit('order.payed', {})).toThrow(/Unknown event/); // typo
  });
});
