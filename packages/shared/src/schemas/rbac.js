import { z } from 'zod';
import { ALL_PERMISSIONS } from '../permissions.js';
import { V } from '../validators/messages.js';
import {
  email,
  name,
  objectId,
  paginationQuery,
  password,
  phone,
  plainText,
} from '../validators/fields.js';

/**
 * Role & staff management bodies, shared by the API and the admin forms.
 * `update` schemas are partial: only provided fields change.
 */

const permissionKey = z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS), {
  error: V.INVALID_TYPE,
});

const uniqueList = (item, max) =>
  z
    .array(item, { error: V.INVALID_TYPE })
    .max(max, { error: V.TOO_LONG })
    .transform((list) => [...new Set(list)]);

/**
 * @param {{ passwordPolicy?: Parameters<typeof password>[0], allowInternationalPhone?: boolean }} [opts]
 */
export function createRbacSchemas({ passwordPolicy, allowInternationalPhone = false } = {}) {
  const role = {
    name: plainText({ min: 2, max: 50 }),
    description: plainText({ max: 200 }),
    permissions: uniqueList(permissionKey, ALL_PERMISSIONS.length),
    /** true → staff with this role can act in every branch (HQ, accounting); false → only their assigned branches. */
    allBranches: z.boolean({ error: V.INVALID_TYPE }),
  };

  const staff = {
    name,
    email,
    phone: phone({ allowInternational: allowInternationalPhone }).nullable(),
    roleId: objectId.nullable(),
    branchIds: uniqueList(objectId, 100),
    status: z.enum(['active', 'disabled'], { error: V.INVALID_TYPE }),
    isSuperAdmin: z.boolean({ error: V.INVALID_TYPE }),
  };

  return {
    roleCreate: z.object({
      name: role.name,
      description: role.description.optional().default(''),
      permissions: role.permissions,
      allBranches: role.allBranches.optional().default(false),
    }),
    roleUpdate: z.object(role).partial(),

    staffCreate: z.object({
      name: staff.name,
      email: staff.email,
      phone: staff.phone.optional().default(null),
      password: password(passwordPolicy),
      roleId: staff.roleId.optional().default(null),
      branchIds: staff.branchIds.optional().default([]),
      isSuperAdmin: staff.isSuperAdmin.optional().default(false),
    }),
    staffUpdate: z.object(staff).partial(),

    staffListQuery: paginationQuery({
      sortable: ['createdAt', 'name', 'email'],
      defaultSort: 'name',
    }).extend({
      q: plainText({ max: 100 }).optional(),
      status: staff.status.optional(),
      roleId: objectId.optional(),
    }),
    idParam: z.object({ id: objectId }),
  };
}
