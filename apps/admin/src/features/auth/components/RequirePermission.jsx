import { useCan } from '@/lib/permissions';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

/**
 * Route-level permission gate (UX). The API enforces the same permission on every call.
 * `perm` may be a list: any one of them is enough.
 */
export function RequirePermission({ perm, children }) {
  const can = useCan();
  const allowed = Array.isArray(perm) ? perm.some(can) : can(perm);
  return allowed ? children : <ForbiddenPage />;
}
