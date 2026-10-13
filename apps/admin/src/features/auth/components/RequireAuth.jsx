import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '../store';

/**
 * Gate for the signed-in area. Unknown session (bootstrapping) is handled by <SessionGate>.
 * Expired/revoked session → back to this page after login via `next`; deliberate sign-out →
 * plain /login, so the next person on a shared terminal doesn't land on the previous user's page.
 */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const signedOut = useAuthStore((s) => s.signedOut);
  const location = useLocation();
  if (status !== 'authenticated') {
    const next = `${location.pathname}${location.search}`;
    const keepNext = !signedOut && next !== '/';
    return (
      <Navigate to={keepNext ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />
    );
  }
  return <Outlet />;
}
