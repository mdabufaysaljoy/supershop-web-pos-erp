import { createReturnExchangeSchemas, PERMISSIONS as P } from '@supershop/shared';
import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as ctrl from './return.controller.js';

/**
 * Returns & exchanges routes (`/api/v1/returns`, P6.6).
 */
export function createReturnRouter() {
  const r = Router();
  const s = createReturnExchangeSchemas();

  r.get(
    '/',
    requireAnyPermission(P.RETURN_CREATE, P.RETURN_APPROVE, P.ORDER_VIEW),
    validate({ query: s.listQuery }),
    ctrl.list,
  );

  r.get(
    '/lookup-order',
    requireAnyPermission(P.RETURN_CREATE, P.RETURN_APPROVE, P.ORDER_VIEW),
    validate({ query: s.lookupOrderQuery }),
    ctrl.lookupOrder,
  );

  r.post('/quote', requirePermission(P.RETURN_CREATE), validate({ body: s.quote }), ctrl.quote);

  r.post('/', requirePermission(P.RETURN_CREATE), validate({ body: s.create }), ctrl.create);

  r.get(
    '/:id',
    requireAnyPermission(P.RETURN_CREATE, P.RETURN_APPROVE, P.ORDER_VIEW),
    validate({ params: s.idParam }),
    ctrl.getOne,
  );

  r.post(
    '/:id/print',
    requireAnyPermission(P.RETURN_CREATE, P.RETURN_APPROVE, P.ORDER_VIEW, P.POS_SELL),
    validate({ params: s.idParam, body: s.printBody }),
    ctrl.printReceipt,
  );

  return r;
}
