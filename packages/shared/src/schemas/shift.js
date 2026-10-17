import { z } from 'zod';
import { SHIFT } from '../pos/shift.js';
import { V } from '../validators/messages.js';
import { moneyMinor, objectId, paginationQuery, plainText } from '../validators/fields.js';

/**
 * Shift & cash-drawer contracts (P6.5).
 * Money fields (`openingCash`, `closingCash`, `amount`) are integer halalas on the API.
 */
export function createShiftSchemas() {
  return {
    idParam: z.object({ id: objectId }),

    currentQuery: z.object({
      branchId: objectId,
    }),

    listQuery: paginationQuery({
      sortable: ['openedAt', 'closedAt', 'shiftNo'],
      defaultSort: '-openedAt',
    }).extend({
      branchId: objectId.optional(),
      status: z.enum(SHIFT.STATUSES, { error: V.INVALID_TYPE }).optional(),
      staffId: objectId.optional(),
    }),

    open: z
      .object({
        branchId: objectId,
        openingCash: moneyMinor({ allowZero: true }),
        note: plainText({ max: 300 }).optional(),
      })
      .strict(),

    cashMovement: z
      .object({
        type: z.enum(SHIFT.MOVEMENT_TYPES, { error: V.INVALID_TYPE }),
        amount: moneyMinor({ allowZero: false }),
        reason: plainText({ min: 2, max: 200 }),
      })
      .strict(),

    close: z
      .object({
        closingCash: moneyMinor({ allowZero: true }),
        note: plainText({ max: 300 }).optional(),
      })
      .strict(),

    printBody: z
      .object({
        kind: z.enum(['x', 'z'], { error: V.INVALID_TYPE }).optional(),
        profileId: objectId.optional(),
      })
      .strict(),

    drawerBody: z
      .object({
        branchId: objectId,
        profileId: objectId.optional(),
      })
      .strict(),
  };
}
