import { useTranslation } from 'react-i18next';
import { PageHeader } from './PageHeader';

/** Placeholder for menu sections whose feature task hasn't shipped yet. */
export function ComingSoonPage({ labelKey }) {
  const { t } = useTranslation();
  return (
    <PageHeader
      title={t('pages.comingSoon.title', { section: t(labelKey) })}
      description={t('pages.comingSoon.body')}
    />
  );
}
