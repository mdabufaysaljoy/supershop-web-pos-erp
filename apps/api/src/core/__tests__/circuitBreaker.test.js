import { describe, expect, it } from 'vitest';
import { CircuitOpenError, createCircuitBreaker } from '../circuitBreaker.js';

describe('circuit breaker', () => {
  it('opens after N failures, fails fast, half-opens after cooldown, closes on success', async () => {
    let t = 0;
    const cb = createCircuitBreaker({
      name: 'x',
      failureThreshold: 2,
      cooldownMs: 100,
      now: () => t,
    });
    const fail = () => cb.exec(async () => Promise.reject(new Error('boom')));
    await expect(fail()).rejects.toThrow('boom');
    await expect(fail()).rejects.toThrow('boom');
    expect(cb.state()).toBe('open');
    await expect(cb.exec(async () => 'x')).rejects.toBeInstanceOf(CircuitOpenError);

    t = 150;
    expect(cb.state()).toBe('half-open');
    await expect(fail()).rejects.toThrow('boom'); // trial failed → open again
    expect(cb.state()).toBe('open');

    t = 300;
    expect(await cb.exec(async () => 'ok')).toBe('ok');
    expect(cb.state()).toBe('closed');
  });
});
