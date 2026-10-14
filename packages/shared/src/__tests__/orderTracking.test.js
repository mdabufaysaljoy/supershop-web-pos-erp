import { describe, expect, it } from 'vitest';
import { ORDER, trackingTimeline } from '../schemas/order.js';

/** P3.6 — what the customer sees on the tracking page for each status. */
const states = (status) => trackingTimeline(status).steps.map((s) => s.state);

describe('trackingTimeline', () => {
  it('marks the step an order has reached as current and the earlier ones as done', () => {
    expect(states('pending')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(states('processing')).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(states('shipped')).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(states('delivered')).toEqual(['done', 'done', 'done', 'current']);
  });

  it('treats paid and cod_confirmed as still placed, and completed as delivered', () => {
    for (const status of ['paid', 'cod_confirmed'])
      expect(states(status)).toEqual(states('pending'));
    expect(states('completed')).toEqual(['done', 'done', 'done', 'current']);
  });

  it('closes the timeline for an order that stopped, keeping the steps it reached', () => {
    const cancelled = trackingTimeline('cancelled');
    expect(cancelled.closed).toBe(true);
    expect(cancelled.steps.map((s) => s.state)).toEqual([
      'done',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(trackingTimeline('refunded').closed).toBe(true);
    expect(trackingTimeline('shipped').closed).toBe(false);
  });

  it('falls back to the first step for a status it does not know yet', () => {
    expect(states('awaiting_pickup')).toEqual(states('pending'));
  });

  it('covers every status the order lifecycle defines', () => {
    for (const status of ORDER.STATUSES) {
      const timeline = trackingTimeline(status);
      expect(timeline.steps).toHaveLength(ORDER.TRACKING_STEPS.length);
      expect(timeline.steps.filter((s) => s.state === 'current').length).toBeLessThanOrEqual(1);
    }
  });
});
