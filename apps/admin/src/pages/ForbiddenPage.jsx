import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { PageHeader } from './PageHeader';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t('pages.forbidden.title')} description={t('pages.forbidden.body')} />
      <Button asChild variant="outline">
        <Link to="/">{t('pages.forbidden.back')}</Link>
      </Button>
    </div>
  );
}
