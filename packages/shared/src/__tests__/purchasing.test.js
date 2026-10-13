import { describe, expect, it } from 'vitest';
import {
  createInventorySchemas,
  createPurchaseOrderSchemas,
  nextUnitCost,
  PURCHASE,
  purchaseTotals,
} from '../index.js';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const po = createPurchaseOrderSchemas();
const inv = createInventorySchemas();
const paths = (r) => r.error.issues.map((i) => i.path.join('.'));

describe('nextUnitCost', () => {
  it('keeps, replaces or averages the cost', () => {
    const base = { oldCost: 1000, onHand: 30, qty: 10, unitCost: 1400 };
    expect(nextUnitCost('none', base)).toBe(1000);
    expect(nextUnitCost('last', base)).toBe(1400);
    expect(nextUnitCost('average', base)).toBe(1100); // (30×10 + 10×14) / 40
    expect(nextUnitCost('average', { ...base, qty: 3, unitCost: 1001 })).toBe(1000); // 1000.0909…
    expect(nextUnitCost('average', { oldCost: 1000, onHand: 1, qty: 1, unitCost: 1001 })).toBe(
      1001,
    ); // .5 rounds up
  });

  it('falls back to the received cost without usable history', () => {
    expect(nextUnitCost('average', { oldCost: null, onHand: 5, qty: 2, unitCost: 900 })).toBe(900);
    expect(nextUnitCost('average', { oldCost: 1000, onHand: 0, qty: 2, unitCost: 900 })).toBe(900);
    expect(nextUnitCost('average', { oldCost: 1000, onHand: -4, qty: 2, unitCost: 900 })).toBe(900);
    expect(nextUnitCost('none', { oldCost: null, onHand: 0, qty: 1, unitCost: 1 })).toBeNull();
  });
});

describe('purchaseTotals', () => {
  it('sums ordered and received value in halalas', () => {
    expect(
      purchaseTotals([
        { qtyOrdered: 10, qtyReceived: 4, unitCost: 1250 },
        { qtyOrdered: 3, qtyReceived: 0, unitCost: 99 },
      ]),
    ).toEqual({ ordered: 12_797, received: 5_000, units: 13, unitsReceived: 4 });
  });

  it('stays a safe integer at the limits', () => {
    const max = Array.from({ length: PURCHASE.MAX_LINES }, () => ({
      qtyOrdered: PURCHASE.MAX_QTY,
      qtyReceived: PURCHASE.MAX_QTY,
      unitCost: PURCHASE.MAX_UNIT_COST,
    }));
    expect(Number.isSafeInteger(purchaseTotals(max).ordered)).toBe(true);
  });
});

describe('purchase order schemas', () => {
  it('validates lines: whole quantities, halala costs, one line per variant', () => {
    const r = po.create.safeParse({
      supplierId: A,
      branchId: B,
      lines: [
        { variantId: A, qty: 2, unitCost: 1050 },
        { variantId: B, qty: 0, unitCost: 10.5 },
      ],
    });
    expect(paths(r)).toEqual(['lines.1.qty', 'lines.1.unitCost']);
    const dup = po.create.safeParse({
      supplierId: A,
      branchId: B,
      lines: [
        { variantId: A, qty: 2, unitCost: 1 },
        { variantId: A, qty: '3', unitCost: 1 },
      ],
    });
    expect(paths(dup)).toEqual(['lines.1.variantId']);
    expect(po.create.parse({ supplierId: A, branchId: B }).lines).toEqual([]);
    expect(po.update.safeParse({}).success).toBe(false);
    expect(po.update.parse({ expectedAt: null })).toEqual({ expectedAt: null });
    expect(po.update.safeParse({ expectedAt: '2026-13-01' }).success).toBe(false);
  });
});

describe('inventory schemas', () => {
  it('needs exactly one of delta / counted and rejects a zero change', () => {
    const r = inv.adjust.safeParse({
      branchId: A,
      reason: 'count',
      lines: [
        { variantId: A, delta: 1, counted: 1 },
        { variantId: B, delta: 0 },
      ],
    });
    expect(paths(r)).toEqual(['lines.0.delta', 'lines.1.delta']);
    expect(
      inv.adjust.parse({
        branchId: A,
        reason: 'count',
        lines: [{ variantId: A, counted: '\u0667' }],
      }).lines[0].counted,
    ).toBe(7);
  });

  it('rejects transfers to the same branch', () => {
    const r = inv.transfer.safeParse({
      fromBranchId: A,
      toBranchId: A,
      lines: [{ variantId: B, qty: 1 }],
    });
    expect(paths(r)).toEqual(['toBranchId']);
  });
});
