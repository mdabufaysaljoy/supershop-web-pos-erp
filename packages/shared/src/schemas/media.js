import { z } from 'zod';
import { V } from '../validators/messages.js';
import { objectId, paginationQuery, plainText } from '../validators/fields.js';

/**
 * Media library contracts (API validation + admin forms).
 * The server decides the real file type from its bytes; `ACCEPT` is only a hint for file pickers.
 */
export const MEDIA = Object.freeze({
  /** MIME types an upload may contain (checked by magic bytes server-side). SVG is excluded (XSS). */
  ACCEPT: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ALT_MAX: 250,
  NAME_MAX: 200,
});

export function createMediaSchemas() {
  const alt = plainText({ max: MEDIA.ALT_MAX });
  const name = plainText({ min: 1, max: MEDIA.NAME_MAX });

  return {
    idParam: z.object({ id: objectId }),
    listQuery: paginationQuery({
      sortable: ['createdAt', 'bytes', 'name'],
      defaultSort: '-createdAt',
      defaultLimit: 40,
    }).extend({ q: plainText({ max: 100 }).optional() }),
    /** Text fields sent alongside the file in the multipart upload. */
    uploadFields: z.object({ alt: alt.optional() }),
    update: z
      .object({ alt: alt.optional(), name: name.optional() })
      .refine((v) => v.alt !== undefined || v.name !== undefined, { error: V.REQUIRED }),
  };
}
