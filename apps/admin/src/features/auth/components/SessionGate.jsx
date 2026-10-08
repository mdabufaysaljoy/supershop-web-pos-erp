import { useTranslation } from 'react-i18next';
import { useBootstrapSession } from '../hooks';

/** Restores the session before rendering routes, so guards never flash the login page. */
export function SessionGate({ children }) {
  const { t } = useTranslation();
  const status = useBootstrapSession();
  if (status === 'unknown') {
    return (
      <div
        className="flex min-h-svh items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        {t('app.loading')}
      </div>
    );
  }
  return children;
}
