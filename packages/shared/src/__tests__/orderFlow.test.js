import { describe, expect, it } from 'vitest';
import {
  ACTORS,
  allowedTransitions,
  findTransition,
  isTerminal,
  ORDER_FLOW,
  ORDER_STATES,
  restocksOn,
  transitionByAction,
} from '../index.js';

/** P4.3 — the order lifecycle lives in one config; these are the promises it makes. */
describe('order flow', () => {
  it('knows the way forward from every state', () => {
    expect(allowedTransitions('pending').map((t) => t.to)).toEqual([
      'paid',
      'cod_confirmed',
      'cancelled',
    ]);
    expect(allowedTransitions('processing', { by: ACTORS.STAFF }).map((t) => t.to)).toEqual([
      'shipped',
      'cancelled',
    ]);
    expect(allowedTransitions('shipped').map((t) => t.to)).toEqual(['delivered', 'refunded']);
    expect(allowedTransitions('processing').map((t) => t.to)).toContain('refunded');
  });

  it('lets a shop do only what a shop should do', () => {
    // A customer's money settling is the gateway's news, not a button in the admin.
    expect(allowedTransitions('pending', { by: ACTORS.STAFF }).map((t) => t.action)).toEqual([
      'markPaid',
      'confirmCod',
      'cancel',
    ]);
    expect(allowedTransitions('paid', { by: ACTORS.SYSTEM }).map((t) => t.action)).toEqual([
      'refund',
    ]);
  });

  it('refuses moves the flow does not describe', () => {
    expect(findTransition('pending', 'shipped')).toBeNull();
    expect(findTransition('delivered', 'processing')).toBeNull();
    expect(findTransition('cancelled', 'paid')).toBeNull();
    expect(transitionByAction('shipped', 'cancel')).toBeNull(); // too late to call it off
  });

  it('puts the goods back only when an order is called off', () => {
    expect(restocksOn('processing', 'cancelled')).toBe(true);
    expect(restocksOn('pending', 'cancelled')).toBe(true);
    expect(restocksOn('paid', 'refunded')).toBe(false); // a refund is money, returns are P6.6
    expect(restocksOn('shipped', 'delivered')).toBe(false);
  });

  it('names the guards the service must satisfy', () => {
    expect(findTransition('processing', 'shipped').guards).toEqual(['hasShipment']);
    expect(findTransition('paid', 'cancelled').guards).toEqual(['moneyReturned']);
    expect(findTransition('pending', 'paid').guards).toEqual(['paymentSettled']);
  });

  it('ends where it should end: nothing left for the shop to do', () => {
    for (const state of ['completed', 'cancelled', 'refunded']) {
      expect(isTerminal(state)).toBe(true);
      expect(allowedTransitions(state, { by: ACTORS.STAFF })).toEqual([]);
    }
    expect(isTerminal('shipped')).toBe(false);
    // A refund can still be recorded against a completed order (a late return, P6.6).
    expect(allowedTransitions('completed', { by: ACTORS.SYSTEM }).map((t) => t.to)).toEqual([
      'refunded',
    ]);
  });

  it('describes only states the order model allows, and every state is reachable', () => {
    const states = new Set(ORDER_STATES);
    for (const t of ORDER_FLOW.transitions) {
      for (const from of [t.from].flat()) expect(states.has(from)).toBe(true);
      expect(states.has(t.to)).toBe(true);
      expect(t.event).toBeTruthy();
    }
    const reachable = new Set([ORDER_FLOW.initial, ...ORDER_FLOW.transitions.map((t) => t.to)]);
    for (const state of ORDER_STATES) expect(reachable.has(state)).toBe(true);
  });
});
