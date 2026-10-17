import { EVENTS } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { earnPointsForOrder, reversePointsForReturn } from './loyalty.service.js';

export function registerLoyaltySubscribers() {
  const onOrderEarn = async ({ payload }) => {
    if (!payload?.customerId || !payload?.orderId) return;
    try {
      await earnPointsForOrder({
        customerId: payload.customerId,
        orderId: payload.orderId,
        orderNo: payload.orderNo,
        totalHalalas: payload.total,
        channel: payload.channel ?? 'online',
      });
    } catch (err) {
      logger.error('Failed to award loyalty points for order', {
        err,
        orderId: payload.orderId,
      });
    }
  };

  const onReturnReverse = async ({ payload }) => {
    if (!payload?.customerId || !payload?.returnId) return;
    try {
      await reversePointsForReturn({
        returnId: payload.returnId,
        returnNo: payload.returnNo,
        orderId: payload.orderId,
        orderNo: payload.orderNo,
        customerId: payload.customerId,
        amount: payload.amount,
        actorId: payload.actorId ?? null,
      });
    } catch (err) {
      logger.error('Failed to reverse loyalty points for return', {
        err,
        returnId: payload.returnId,
      });
    }
  };

  eventBus.on(EVENTS.ORDER_PAID, onOrderEarn);
  eventBus.on(EVENTS.ORDER_COMPLETED, onOrderEarn);
  eventBus.on(EVENTS.LOYALTY_REVERSED, onReturnReverse);
}
