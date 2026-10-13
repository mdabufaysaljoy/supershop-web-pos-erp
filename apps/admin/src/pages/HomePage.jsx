import { PERMISSIONS } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { allNavItems } from '@/components/layout/navigation';
import { useCan } from '@/lib/permissions';
import { DashboardPage } from './DashboardPage';
import { PageHeader } from './PageHeader';

/**
 * `/`: the dashboard if allowed; otherwise the first section the user may open (e.g. a cashier
 * lands on the POS); otherwise a "no access yet" message.
 */
export function HomePage() {
  const { t } = useTranslation();
  const can = useCan();
  if (can(PERMISSIONS.DASHBOARD_VIEW)) return <DashboardPage />;
  const first = allNavItems().find((i) => i.path !== '/' && can(i.permission));
  if (first) return <Navigate to={first.path} replace />;
  return <PageHeader title={t('pages.noAccess.title')} description={t('pages.noAccess.body')} />;
}
