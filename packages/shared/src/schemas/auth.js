import { z } from 'zod';
import { V } from '../validators/messages.js';
import { email, name, password, phone } from '../validators/fields.js';

/**
 * Auth request bodies, shared by the API (validate middleware) and the admin/storefront forms.
 * Factory: password policy and phone rules come from settings.
 *
 * Login bodies deliberately do NOT apply the password policy (an old password that predates a
 * stricter policy must still be able to log in); they only bound the length.
 */

const loginPassword = z
  .string({ error: (iss) => (iss.input === undefined ? V.REQUIRED : V.INVALID_TYPE) })
  .min(1, { error: V.REQUIRED })
  .max(128, { error: V.PASSWORD_TOO_LONG });

// Opaque one-time tokens are base64url, 43 chars for 32 bytes.
const oneTimeToken = z
  .string({ error: V.REQUIRED })
  .regex(/^[\w-]{20,200}$/, { error: V.CODE_INVALID });

/**
 * @param {{ passwordPolicy?: Parameters<typeof password>[0], allowInternationalPhone?: boolean }} [opts]
 */
export function createAuthSchemas({ passwordPolicy, allowInternationalPhone = false } = {}) {
  const newPassword = password(passwordPolicy);
  const phoneSchema = phone({ allowInternational: allowInternationalPhone });

  return {
    staffLogin: z.object({ email, password: loginPassword }),

    /** `identifier` = email or phone; the API normalizes it. */
    customerLogin: z.object({
      identifier: z
        .string({ error: V.REQUIRED })
        .trim()
        .min(3, { error: V.REQUIRED })
        .max(254, { error: V.TOO_LONG }),
      password: loginPassword,
    }),

    customerRegister: z.object({
      name,
      email,
      phone: phoneSchema.optional(),
      password: newPassword,
    }),

    forgotPassword: z.object({ email }),
    resetPassword: z.object({ token: oneTimeToken, password: newPassword }),
    changePassword: z.object({ currentPassword: loginPassword, newPassword }),
    verifyEmail: z.object({ token: oneTimeToken }),
  };
}
