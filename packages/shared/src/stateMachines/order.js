import { EVENTS } from '../events.js';

/**
 * Order lifecycle (P4.3) — ONE file describes every state an order can be in, every move between
 * them, what guards that move and what the shop hears about it (CLAUDE.md §2.4). Code asks this
 * config; it never hard-codes a status comparison, so changing the flow is an edit here.
 *
 * Guards are NAMES: the config says what must hold, the service knows how to check it (it needs
 * payments and stock). The admin reads the same config to show the buttons that apply right now.
 */

/** Who may ask for a move: the shop (staff) or the system (a gateway, a job). */
export const ACTORS = Object.freeze({ STAFF: 'staff', SYSTEM: 'system' });

export const ORDER_FLOW = Object.freeze({
  initial: 'pending',
  /**
   * States where the shop has nothing left to do. The SYSTEM may still record a refund against a
   * completed order (a customer returns something next week — P6.6 handles the goods), so
   * "terminal" means "no staff action left", not "nothing can ever happen".
   */
  terminal: Object.freeze(['completed', 'cancelled', 'refunded']),
  /**
   * States where the goods count as sold. Reports and the "best selling" product rail (P5.3) ask
   * this instead of comparing statuses themselves; a flow change stays an edit to this file.
   */
  sold: Object.freeze([
    'paid',
    'cod_confirmed',
    'processing',
    'shipped',
    'delivered',
    'completed',
    'partially_returned',
    'exchanged',
  ]),
  transitions: Object.freeze([
    {
      from: 'pending',
      to: 'paid',
      action: 'markPaid',
      by: [ACTORS.SYSTEM, ACTORS.STAFF],
      guards: ['paymentSettled'],
      event: EVENTS.ORDER_PAID,
    },
    {
      from: 'pending',
      to: 'cod_confirmed',
      action: 'confirmCod',
      by: [ACTORS.STAFF],
      guards: ['methodIsCod'],
      event: EVENTS.ORDER_COD_CONFIRMED,
    },
    {
      from: ['paid', 'cod_confirmed'],
      to: 'processing',
      action: 'startProcessing',
      by: [ACTORS.STAFF],
      event: EVENTS.ORDER_STATUS_CHANGED,
    },
    {
      from: 'processing',
      to: 'shipped',
      action: 'ship',
      by: [ACTORS.STAFF],
      /** A shipment (carrier, and a tracking number when the carrier gives one) must exist. */
      guards: ['hasShipment'],
      event: EVENTS.ORDER_SHIPPED,
    },
    {
      from: 'shipped',
      to: 'delivered',
      action: 'markDelivered',
      by: [ACTORS.STAFF],
      event: EVENTS.ORDER_DELIVERED,
    },
    {
      from: 'delivered',
      to: 'completed',
      action: 'complete',
      by: [ACTORS.STAFF, ACTORS.SYSTEM],
      event: EVENTS.ORDER_COMPLETED,
    },
    {
      // Anything not yet handed to the customer can be called off; the goods go back on the shelf.
      from: ['pending', 'paid', 'cod_confirmed', 'processing'],
      to: 'cancelled',
      action: 'cancel',
      by: [ACTORS.STAFF],
      guards: ['moneyReturned'],
      restock: true,
      event: EVENTS.ORDER_CANCELLED,
    },
    {
      // Set by the payments module when a refund covers the whole order.
      from: ['paid', 'processing', 'shipped', 'delivered', 'completed'],
      to: 'refunded',
      action: 'refund',
      by: [ACTORS.SYSTEM],
      event: EVENTS.ORDER_REFUNDED,
    },
  ]),
});

const asList = (v) => (Array.isArray(v) ? v : [v]);

/** Every state the flow knows, in the order a customer meets them. */
export const ORDER_STATES = Object.freeze([
  'pending',
  'paid',
  'cod_confirmed',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
]);

/**
 * The transition that moves an order from `from` to `to`, or null.
 * @returns {{ from: string[], to: string, action: string, guards?: string[], restock?: boolean, event: string, by: string[] } | null}
 */
export function findTransition(from, to) {
  return ORDER_FLOW.transitions.find((t) => asList(t.from).includes(from) && t.to === to) ?? null;
}

/** The transition behind a named action (`cancel`, `ship`…) for an order in `from`. */
export function transitionByAction(from, action) {
  return (
    ORDER_FLOW.transitions.find((t) => t.action === action && asList(t.from).includes(from)) ?? null
  );
}

/**
 * What can be done to an order in this state, optionally limited to one kind of actor.
 * The admin builds its buttons from this, so a flow change needs no UI change.
 * @param {string} from
 * @param {{ by?: string }} [opts]
 */
export function allowedTransitions(from, { by } = {}) {
  return ORDER_FLOW.transitions
    .filter((t) => asList(t.from).includes(from) && (!by || t.by.includes(by)))
    .map((t) => ({
      to: t.to,
      action: t.action,
      guards: t.guards ?? [],
      restock: Boolean(t.restock),
    }));
}

export const isTerminal = (status) => ORDER_FLOW.terminal.includes(status);

/** Whether an order in this state counts as a sale (best-sellers, reports). */
export const countsAsSold = (status) => ORDER_FLOW.sold.includes(status);

/** Does moving this way put the goods back on the shelf? */
export const restocksOn = (from, to) => Boolean(findTransition(from, to)?.restock);
