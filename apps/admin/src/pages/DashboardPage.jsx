import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/features/auth/store';
import { PageHeader } from './PageHeader';

/** Placeholder home; KPIs and charts arrive in P8.1. */
export function DashboardPage() {
  const { t } = useTranslation();
  const name = useAuthStore((s) => s.profile?.name ?? '');
  return (
    <PageHeader
      title={t('pages.dashboard.welcome', { name })}
      description={t('pages.dashboard.intro')}
    />
  );
}
