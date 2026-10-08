import { describe, expect, it } from 'vitest';
import { filterNav, NAV } from '@/components/layout/navigation';
import { can, safeNextPath } from '../permissions';

describe('can', () => {
  it('checks the permission list (deny by default)', () => {
    expect(can({ permissions: ['pos.sell'] }, 'pos.sell')).toBe(true);
    expect(can({ permissions: ['pos.sell'] }, 'order.refund')).toBe(false);
    expect(can(null, 'pos.sell')).toBe(false);
  });
});

describe('filterNav', () => {
  it('shows only permitted items and drops empty sections', () => {
    const cashier = (k) => ['pos.sell', 'order.view', 'product.view'].includes(k);
    const sections = filterNav(NAV, cashier);
    expect(sections.map((s) => s.section)).toEqual(['nav.sections.sales', 'nav.sections.catalog']);
    expect(sections.flatMap((s) => s.items.map((i) => i.path))).toEqual([
      '/pos',
      '/orders',
      '/products',
    ]);
    expect(filterNav(NAV, () => false)).toEqual([]);
  });

  it('every nav item is gated by a real permission', async () => {
    const { isPermission } = await import('@supershop/shared');
    for (const item of NAV.flatMap((s) => s.items))
      expect(isPermission(item.permission)).toBe(true);
  });
});

describe('safeNextPath (open-redirect guard)', () => {
  it.each([
    ['/orders?page=2', '/orders?page=2'],
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['/\\evil.com', '/'],
    ['javascript:alert(1)', '/'],
    [null, '/'],
  ])('%s → %s', (input, expected) => expect(safeNextPath(input)).toBe(expected));
});
