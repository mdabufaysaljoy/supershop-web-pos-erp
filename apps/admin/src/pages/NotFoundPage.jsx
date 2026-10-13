import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { PageHeader } from './PageHeader';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t('pages.notFound.title')} description={t('pages.notFound.body')} />
      <Button asChild variant="outline">
        <Link to="/">{t('pages.notFound.back')}</Link>
      </Button>
    </div>
  );
}
