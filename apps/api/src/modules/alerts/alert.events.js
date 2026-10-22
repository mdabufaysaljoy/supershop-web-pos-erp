import { EVENTS, PERMISSIONS } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { formatMoney } from '@supershop/shared';
import { raiseAlert } from './alert.service.js';

let registered = false;
/** How a variant is named in a notice — injected, so alerts do not reach into the catalogue. */
let describeVariant = async (id) => String(id);

/**
 * What the shop is told about, as subscribers — adding a notice is one entry here, and no change
 * to the service that did the work (CLAUDE.md §2.2: side effects hang off the event bus).
 *
 * @param {{ currency?: () => string }} [providers]
 */
export function registerAlertSubscribers({ currency = () => 'SAR', nameVariant = null } = {}) {
  if (nameVariant) describeVariant = nameVariant;
  if (registered) return;
  registered = true;

  /** A sale on the website: the one thing a shop wants to look up from the bell. */
  eventBus.on(EVENTS.ORDER_CREATED, async (event) => {
    const { orderId, orderNo, channel, total, itemCount } = event.payload ?? {};
    if (channel !== 'online') return;
    await raiseAlert({
      type: 'order.online',
      title: `New online order ${orderNo}`,
      body: `${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatMoney(total ?? 0, {
        currency: currency(),
      })}`,
      link: `/orders/${orderId}`,
      permission: PERMISSIONS.ORDER_VIEW,
      entity: { type: 'order', id: String(orderId) },
    });
  });

  /** The shelf is running out: the shop would rather hear it than find out from a customer. */
  eventBus.on(EVENTS.STOCK_OUT, async (event) => {
    const { variantId, onHand } = event.payload ?? {};
    if (!variantId) return;
    await raiseAlert({
      type: 'stock.out',
      title: 'Something has run out',
      body: `${await describeVariant(variantId)} · ${onHand ?? 0} left`,
      link: '/inventory',
      permission: PERMISSIONS.INVENTORY_VIEW,
      entity: { type: 'variant', id: String(variantId) },
    });
  });
}
