import { describe, expect, it } from 'vitest';
import { createShiftSchemas, previewLines, renderShiftReport, summarizeShift } from '../index.js';

describe('summarizeShift', () => {
  it('computes expected cash, tender breakdown, and discrepancy across split payments and cash movements', () => {
    const summary = summarizeShift({
      openingCash: 50_000, // SAR 500.00
      closingCash: 66_000, // SAR 660.00 (SAR 5.00 short of 665.00)
      movements: [
        { type: 'in', amount: 10_000, reason: 'Change float top-up' },
        { type: 'out', amount: 3500, reason: 'Courier tip' },
      ],
      orders: [
        {
          status: 'completed',
          totals: {
            itemCount: 2,
            subtotal: 15_000,
            discountTotal: 1500,
            net: 11_739,
            vat: 1761,
            total: 13_500,
          },
          payments: [{ method: 'cash', methodType: 'cash', label: 'Cash', amount: 15_000 }],
          changeGiven: 1500, // net cash = 13,500
        },
        {
          status: 'completed',
          totals: {
            itemCount: 1,
            subtotal: 20_000,
            discountTotal: 0,
            net: 17_391,
            vat: 2609,
            total: 20_000,
          },
          // Split: 150.00 card + 60.00 cash with 10.00 change => net cash 50.00
          payments: [
            { method: 'card', methodType: 'offline', label: 'Mada Card', amount: 15_000 },
            { method: 'cash', methodType: 'cash', label: 'Cash', amount: 6000 },
          ],
          changeGiven: 1000,
        },
        {
          // Cancelled orders never count toward shift sales or drawer cash
          status: 'cancelled',
          totals: {
            itemCount: 5,
            subtotal: 99_000,
            discountTotal: 0,
            net: 86_087,
            vat: 12_913,
            total: 99_000,
          },
          payments: [{ method: 'cash', methodType: 'cash', label: 'Cash', amount: 99_000 }],
          changeGiven: 0,
        },
      ],
    });

    expect(summary.sales).toEqual({
      count: 2,
      itemCount: 3,
      subtotal: 35_000,
      discountTotal: 1500,
      net: 29_130,
      vat: 4370,
      total: 33_500,
    });
    expect(summary.cashSales).toBe(18_500); // 13,500 + 5,000
    expect(summary.cashIn).toBe(10_000);
    expect(summary.cashOut).toBe(3500);
    expect(summary.netCashMovements).toBe(6500);
    // expectedCash = 50,000 + 18,500 + 10,000 - 3,500 = 75,000
    expect(summary.expectedCash).toBe(75_000);
    expect(summary.closingCash).toBe(66_000);
    expect(summary.discrepancy).toBe(-9000);

    const cashRow = summary.byMethod.find((m) => m.method === 'cash');
    const cardRow = summary.byMethod.find((m) => m.method === 'card');
    expect(cashRow).toEqual({
      method: 'cash',
      methodType: 'cash',
      label: 'Cash',
      count: 2,
      tendered: 21_000,
      changeGiven: 2500,
      netAmount: 18_500,
    });
    expect(cardRow).toEqual({
      method: 'card',
      methodType: 'offline',
      label: 'Mada Card',
      count: 1,
      tendered: 15_000,
      changeGiven: 0,
      netAmount: 15_000,
    });
  });

  it('leaves closingCash and discrepancy null while shift is open', () => {
    const summary = summarizeShift({ openingCash: 20_000, movements: [], orders: [] });
    expect(summary.expectedCash).toBe(20_000);
    expect(summary.closingCash).toBeNull();
    expect(summary.discrepancy).toBeNull();
  });
});

describe('renderShiftReport (X-Report and Z-Report)', () => {
  const sampleShift = {
    shiftNo: 'SHF-000007',
    zReportNo: 'Z-000003',
    branchName: 'Main Store',
    openedByName: 'Sarah',
    closedByName: 'Manager Ali',
    openedAt: '2026-10-17T06:00:00.000Z',
    closedAt: '2026-10-17T14:00:00.000Z',
    openingCash: 50_000,
    closingCash: 68_500,
    movements: [{ type: 'in', amount: 5000, reason: 'Coins' }],
    orders: [
      {
        status: 'completed',
        totals: {
          itemCount: 1,
          subtotal: 13_500,
          discountTotal: 0,
          net: 11_739,
          vat: 1761,
          total: 13_500,
        },
        payments: [{ method: 'cash', methodType: 'cash', label: 'Cash', amount: 13_500 }],
        changeGiven: 0,
      },
    ],
    closeNote: 'All balanced',
  };

  it('renders X-Report without Z-Report or counted-cash lines', () => {
    const bytes = renderShiftReport(sampleShift, {
      kind: 'x',
      widthMm: 80,
      shop: { name: 'Supershop', vatNumber: '300000000000003' },
    });
    const text = previewLines(bytes).join('\n');
    expect(text).toContain('X-REPORT (MID-SHIFT)');
    expect(text).toContain('SHF-000007');
    expect(text).toContain('Expected cash');
    expect(text).not.toContain('Counted cash');
  });

  it('renders Z-Report with Z-number, counted cash, and discrepancy', () => {
    const bytes = renderShiftReport(sampleShift, {
      kind: 'z',
      widthMm: 80,
      shop: { name: 'Supershop', vatNumber: '300000000000003' },
    });
    const text = previewLines(bytes).join('\n');
    expect(text).toContain('Z-REPORT (END OF SHIFT)');
    expect(text).toContain('Z-000003');
    expect(text).toContain('Counted cash');
    expect(text).toContain('Discrepancy');
    expect(text).toContain('All balanced');
  });
});

describe('createShiftSchemas', () => {
  const schemas = createShiftSchemas();

  it('validates shift open, cash movement, and close payloads', () => {
    expect(
      schemas.open.safeParse({
        branchId: '507f1f77bcf86cd799439011',
        openingCash: 0,
        note: 'Morning float',
      }).success,
    ).toBe(true);

    expect(
      schemas.cashMovement.safeParse({
        type: 'out',
        amount: 2500,
        reason: 'Bought receipt paper',
      }).success,
    ).toBe(true);

    expect(
      schemas.cashMovement.safeParse({
        type: 'in',
        amount: 0,
        reason: 'Zero not allowed',
      }).success,
    ).toBe(false);

    expect(
      schemas.close.safeParse({
        closingCash: 52_500,
        note: 'Counted twice',
      }).success,
    ).toBe(true);
  });
});
