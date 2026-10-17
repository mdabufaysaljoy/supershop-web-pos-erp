import { describe, expect, it } from 'vitest';
import { CUSTOMER_SEGMENTS, createCustomerAdminSchemas, deriveCustomerSegment } from '../index.js';

describe('Customer segmentation', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');

  it('classifies customer as VIP if lifetime spend is >= 200,000 halalas (2,000 SAR)', () => {
    const segment = deriveCustomerSegment({
      lifetimeSpendHalalas: 250_000,
      orderCount: 1,
      lastOrderAt: new Date('2026-10-01'),
      now,
    });
    expect(segment).toBe(CUSTOMER_SEGMENTS.VIP);
  });

  it('classifies customer as VIP if loyalty tier is gold or platinum', () => {
    expect(deriveCustomerSegment({ tier: 'gold', orderCount: 2, now })).toBe(CUSTOMER_SEGMENTS.VIP);
    expect(deriveCustomerSegment({ tier: 'platinum', orderCount: 1, now })).toBe(
      CUSTOMER_SEGMENTS.VIP,
    );
  });

  it('classifies customer as loyal if orderCount >= 3 and not VIP', () => {
    const segment = deriveCustomerSegment({
      orderCount: 4,
      lifetimeSpendHalalas: 50_000,
      tier: 'silver',
      lastOrderAt: new Date('2026-05-01'),
      now,
    });
    expect(segment).toBe(CUSTOMER_SEGMENTS.LOYAL);
  });

  it('classifies customer as idle if 0 orders and registered > 30 days ago', () => {
    const segment = deriveCustomerSegment({
      orderCount: 0,
      createdAt: new Date('2026-08-01'),
      now,
    });
    expect(segment).toBe(CUSTOMER_SEGMENTS.IDLE);
  });

  it('classifies customer as new if registered <= 30 days ago and orderCount <= 1', () => {
    const seg1 = deriveCustomerSegment({
      orderCount: 0,
      createdAt: new Date('2026-10-10'),
      now,
    });
    expect(seg1).toBe(CUSTOMER_SEGMENTS.NEW);

    const seg2 = deriveCustomerSegment({
      orderCount: 1,
      createdAt: new Date('2026-10-05'),
      lastOrderAt: new Date('2026-10-06'),
      now,
    });
    expect(seg2).toBe(CUSTOMER_SEGMENTS.NEW);
  });

  it('classifies customer as active if last order was within 60 days', () => {
    const segment = deriveCustomerSegment({
      orderCount: 2,
      createdAt: new Date('2026-05-01'),
      lastOrderAt: new Date('2026-09-20'),
      now,
    });
    expect(segment).toBe(CUSTOMER_SEGMENTS.ACTIVE);
  });

  it('classifies customer as slipping if last order was between 60 and 120 days ago', () => {
    const segment = deriveCustomerSegment({
      orderCount: 2,
      createdAt: new Date('2026-01-01'),
      lastOrderAt: new Date('2026-07-15'), // ~95 days ago
      now,
    });
    expect(segment).toBe(CUSTOMER_SEGMENTS.SLIPPING);
  });

  it('classifies customer as churn_risk if last order was > 120 days ago', () => {
    const segment = deriveCustomerSegment({
      orderCount: 2,
      createdAt: new Date('2025-01-01'),
      lastOrderAt: new Date('2026-05-01'), // ~170 days ago
      now,
    });
    expect(segment).toBe(CUSTOMER_SEGMENTS.CHURN_RISK);
  });
});

describe('Customer Admin Schemas', () => {
  const schemas = createCustomerAdminSchemas();

  it('validates list query parameters with pagination and sorting', () => {
    const valid = schemas.listQuery.parse({
      page: '2',
      limit: '15',
      sort: '-lifetimeSpend',
      segment: 'vip',
      status: 'active',
      q: 'Fatima',
    });
    expect(valid.page).toBe(2);
    expect(valid.limit).toBe(15);
    expect(valid.sort).toEqual({ field: 'lifetimeSpend', direction: -1 });
    expect(valid.segment).toBe('vip');
    expect(valid.status).toBe('active');
    expect(valid.q).toBe('Fatima');
  });

  it('rejects invalid sort field', () => {
    expect(() => schemas.listQuery.parse({ sort: 'hackedField' })).toThrow();
  });

  it('validates customer update body', () => {
    const valid = schemas.updateCustomer.parse({
      name: 'Nouf Al-Otaibi',
      status: 'disabled',
      lang: 'ar',
    });
    expect(valid.name).toBe('Nouf Al-Otaibi');
    expect(valid.status).toBe('disabled');
    expect(valid.lang).toBe('ar');
  });

  it('rejects empty update body', () => {
    expect(() => schemas.updateCustomer.parse({})).toThrow();
  });
});
