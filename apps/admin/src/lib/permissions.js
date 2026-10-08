import { useCallback } from 'react';
import { useAuthStore } from '@/features/auth/store';

/**
 * Client-side permission checks — UX only (hide what the user can't use). The SERVER is the source
 * of truth and enforces every permission (CLAUDE.md §2.3).
 * Super-admins receive the full permission list from the API, so no special case is needed here.
 */

/** @param {{ permissions?: string[] } | null} access  @param {string} key */
export const can = (access, key) => Boolean(access?.permissions?.includes(key));

/** Hook returning a stable `can(key)` bound to the current session. */
export function useCan() {
  const access = useAuthStore((s) => s.access);
  return useCallback((key) => can(access, key), [access]);
}

/** Renders children only when the permission is held. */
export function Can({ perm, children, fallback = null }) {
  return useCan()(perm) ? children : fallback;
}

/**
 * Only same-app relative paths are allowed as post-login redirects (prevents open redirects like
 * `?next=//evil.com` or `?next=https://evil.com`).
 * @param {string | null | undefined} next
 */
export function safeNextPath(next) {
  if (
    typeof next !== 'string' ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.includes('\\')
  )
    return '/';
  return next;
}
