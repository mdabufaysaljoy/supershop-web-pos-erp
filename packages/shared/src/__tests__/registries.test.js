import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ERROR_CODES,
  EVENTS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  TRACKING_EVENTS,
  hasPermission,
  isEventName,
  isPermission,
  isTrackingEvent,
  normalizeDigits,
} from '../index.js';

const RESOURCE_ACTION = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/;

describe('permissions', () => {
  it('keys are unique resource.action strings', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    ALL_PERMISSIONS.forEach((k) => expect(k).toMatch(RESOURCE_ACTION));
  });

  it('constant map covers every key', () => {
    expect(Object.values(PERMISSIONS).sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(PERMISSIONS.PRODUCT_VIEW_COST).toBe('product.viewCost');
    expect(PERMISSIONS.POS_SELL).toBe('pos.sell');
  });

  it('includes the permissions named in the spec', () => {
    [
      'product.create',
      'order.refund',
      'pos.sell',
      'report.view',
      'settings.payments',
      'staff.manage',
    ].forEach((k) => expect(isPermission(k)).toBe(true));
  });

  it('hasPermission denies unknown keys and works with arrays and sets', () => {
    expect(hasPermission(['pos.sell'], 'pos.sell')).toBe(true);
    expect(hasPermission(new Set(['pos.sell']), 'pos.sell')).toBe(true);
    expect(hasPermission(['pos.sell'], 'order.refund')).toBe(false);
    expect(hasPermission(['made.up'], 'made.up')).toBe(false);
    expect(hasPermission(undefined, 'pos.sell')).toBe(false);
  });

  it('registry is immutable', () => {
    expect(Object.isFrozen(PERMISSION_GROUPS)).toBe(true);
    expect(Object.isFrozen(PERMISSION_GROUPS.product)).toBe(true);
  });
});

describe('events', () => {
  it('names are unique resource.action strings', () => {
    const names = Object.values(EVENTS);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((n) => expect(n).toMatch(RESOURCE_ACTION));
    expect(isEventName('order.paid')).toBe(true);
    expect(isEventName('order.pay')).toBe(false);
  });
});

describe('tracking events', () => {
  it('match the §5.5 dictionary exactly', () => {
    expect(Object.values(TRACKING_EVENTS).sort()).toEqual(
      [
        'page_view',
        'view_item_list',
        'view_item',
        'search',
        'add_to_cart',
        'remove_from_cart',
        'view_cart',
        'begin_checkout',
        'add_shipping_info',
        'add_payment_info',
        'purchase',
        'refund',
        'sign_up',
        'login',
        'generate_lead',
      ].sort(),
    );
    expect(isTrackingEvent('purchase')).toBe(true);
    expect(isTrackingEvent('Purchase')).toBe(false);
  });
});

describe('error codes', () => {
  it('values equal their keys (stable, greppable)', () => {
    Object.entries(ERROR_CODES).forEach(([k, val]) => expect(val).toBe(k));
  });
});

describe('normalizeDigits', () => {
  it('converts Arabic-Indic and Persian digits and separators', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeDigits('١٬٢٣٤٫٥')).toBe('1234.5');
    expect(normalizeDigits('abc')).toBe('abc');
  });
});
