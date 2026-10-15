import { describe, expect, it } from 'vitest';
import { safeJobId } from '../queue.js';

/** BullMQ builds Redis keys from job ids: ':' is reserved and rejects the enqueue (found in P4.5). */
describe('safeJobId', () => {
  it('keeps a readable id but removes what BullMQ reserves', () => {
    expect(safeJobId('order.placed.email.sara@example.com')).toBe(
      'order.placed.email.sara@example.com',
    );
    expect(safeJobId('order.placed:email:ORD-1')).toBe('order.placed-email-ORD-1');
    expect(safeJobId('a:b c/d')).toBe('a-b-c-d');
  });

  it('stays short enough for a key', () => {
    expect(safeJobId('x'.repeat(300))).toHaveLength(120);
  });
});
