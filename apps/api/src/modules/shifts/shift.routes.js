import { createShiftSchemas, PERMISSIONS as P } from '@supershop/shared';
import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as ctrl from './shift.controller.js';

/**
 * `/api/v1/shifts` routes (P6.5).
 */
export function createShiftRouter() {
  const router = Router();
  const schemas = createShiftSchemas();

  router.get(
    '/',
    requireAnyPermission(P.SHIFT_VIEW, P.SHIFT_OPEN, P.SHIFT_CLOSE),
    validate({ query: schemas.listQuery }),
    ctrl.list,
  );

  router.get(
    '/current',
    requireAnyPermission(P.SHIFT_VIEW, P.SHIFT_OPEN, P.SHIFT_CLOSE, P.POS_SELL),
    validate({ query: schemas.currentQuery }),
    ctrl.current,
  );

  router.post(
    '/open',
    requirePermission(P.SHIFT_OPEN),
    validate({ body: schemas.open }),
    ctrl.open,
  );

  router.post(
    '/drawer',
    requireAnyPermission(P.SHIFT_OPEN, P.SHIFT_CLOSE, P.SHIFT_CASH_MOVEMENT),
    validate({ body: schemas.drawerBody }),
    ctrl.kickDrawer,
  );

  router.get(
    '/:id',
    requireAnyPermission(P.SHIFT_VIEW, P.SHIFT_OPEN, P.SHIFT_CLOSE),
    validate({ params: schemas.idParam }),
    ctrl.getOne,
  );

  router.post(
    '/:id/movements',
    requirePermission(P.SHIFT_CASH_MOVEMENT),
    validate({ params: schemas.idParam, body: schemas.cashMovement }),
    ctrl.recordMovement,
  );

  router.post(
    '/:id/close',
    requirePermission(P.SHIFT_CLOSE),
    validate({ params: schemas.idParam, body: schemas.close }),
    ctrl.close,
  );

  router.get(
    '/:id/x-report',
    requireAnyPermission(P.SHIFT_VIEW, P.SHIFT_OPEN, P.SHIFT_CLOSE),
    validate({ params: schemas.idParam }),
    ctrl.xReport,
  );

  router.get(
    '/:id/z-report',
    requireAnyPermission(P.SHIFT_VIEW, P.SHIFT_CLOSE),
    validate({ params: schemas.idParam }),
    ctrl.zReport,
  );

  router.post(
    '/:id/print',
    requireAnyPermission(P.SHIFT_VIEW, P.SHIFT_OPEN, P.SHIFT_CLOSE),
    validate({ params: schemas.idParam, body: schemas.printBody }),
    ctrl.printReport,
  );

  return router;
}
