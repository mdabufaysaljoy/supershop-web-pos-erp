import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createAccessContext } from '../access.js';

const B1 = '64b000000000000000000001';
const B2 = '64b000000000000000000002';

describe('createAccessContext', () => {
  const cashier = createAccessContext({
    staffId: 's1',
    permissions: ['pos.sell', 'shift.open', 'not.a.permission'],
    branchIds: [B1],
  });

  it('checks permissions (deny by default, unknown keys dropped)', () => {
    expect(cashier.can('pos.sell')).toBe(true);
    expect(cashier.can('order.refund')).toBe(false);
    expect(cashier.can('not.a.permission')).toBe(false);
    expect(cashier.permissions).toEqual(['pos.sell', 'shift.open']);
    expect(() => cashier.assert('order.refund')).toThrow(/Missing permission/);
  });

  it('scopes branches', () => {
    expect(cashier.canAccessBranch(B1)).toBe(true);
    expect(cashier.canAccessBranch(new mongoose.Types.ObjectId(B1))).toBe(true);
    expect(cashier.canAccessBranch(B2)).toBe(false);
    expect(cashier.canAccessBranch(null)).toBe(false);
    expect(() => cashier.assertBranch(B2)).toThrow(
      expect.objectContaining({ code: 'BRANCH_SCOPE_DENIED', status: 403 }),
    );
  });

  it('builds branch query filters', () => {
    const f = cashier.branchFilter();
    expect(f.branchId.$in.map(String)).toEqual([B1]);
    expect(String(cashier.branchFilter('branchId', B1).branchId)).toBe(B1);
    expect(() => cashier.branchFilter('branchId', B2)).toThrow();
    expect(createAccessContext({ staffId: 'x' }).branchFilter().branchId.$in).toEqual([]); // no branches → nothing
    expect(
      createAccessContext({ staffId: 'x', allBranches: true }).branchFilter('toBranchId'),
    ).toEqual({});
  });

  it('super-admin bypasses permission and branch checks but not unknown keys', () => {
    const root = createAccessContext({ staffId: 'r', isSuperAdmin: true });
    expect(root.can('settings.payments')).toBe(true);
    expect(root.can('made.up')).toBe(false);
    expect(root.canAccessBranch(B2)).toBe(true);
    expect(root.holdsAll(['role.manage'])).toBe(true);
    expect(root.permissions).toContain('settings.payments'); // full list for client-side can()
  });

  it('escalation helpers', () => {
    expect(cashier.holdsAll(['pos.sell'])).toBe(true);
    expect(cashier.holdsAll(['pos.sell', 'pos.void'])).toBe(false);
    expect(cashier.coversBranches([B1])).toBe(true);
    expect(cashier.coversBranches([B1, B2])).toBe(false);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(cashier)).toBe(true);
    expect(Object.isFrozen(cashier.permissions)).toBe(true);
  });
});
