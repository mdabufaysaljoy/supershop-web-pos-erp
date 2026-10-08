import { useCan } from '@/lib/permissions';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

/** Route-level permission gate (UX). The API enforces the same permission on every call. */
export function RequirePermission({ perm, children }) {
  return useCan()(perm) ? children : <ForbiddenPage />;
}
