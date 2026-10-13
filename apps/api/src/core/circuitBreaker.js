/**
 * Minimal circuit breaker for calls to external services (translation, payment gateways, SMS…).
 * closed → (N consecutive failures) → open: calls fail fast for `cooldownMs`
 *        → half-open: one trial call; success closes, failure re-opens.
 * Prevents hammering a down service and keeps request latency bounded.
 */
export class CircuitOpenError extends Error {
  constructor(name) {
    super(`Circuit "${name}" is open`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * @param {{ name: string, failureThreshold?: number, cooldownMs?: number, now?: () => number }} opts
 */
export function createCircuitBreaker({
  name,
  failureThreshold = 5,
  cooldownMs = 30_000,
  now = Date.now,
}) {
  let failures = 0;
  let openedAt = null;
  let trialInFlight = false;

  const state = () => {
    if (openedAt === null) return 'closed';
    return now() - openedAt >= cooldownMs ? 'half-open' : 'open';
  };

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async function exec(fn) {
    const s = state();
    if (s === 'open' || (s === 'half-open' && trialInFlight)) throw new CircuitOpenError(name);
    if (s === 'half-open') trialInFlight = true;
    try {
      const result = await fn();
      failures = 0;
      openedAt = null;
      return result;
    } catch (err) {
      failures += 1;
      if (s === 'half-open' || failures >= failureThreshold) openedAt = now();
      throw err;
    } finally {
      if (s === 'half-open') trialInFlight = false;
    }
  }

  const reset = () => {
    failures = 0;
    openedAt = null;
    trialInFlight = false;
  };

  return { exec, state, reset };
}
