import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Previous / "Page x of y" / Next. Renders nothing for a single page. */
export function Pagination({ page, pages, onPage }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3" aria-label={t('common.pagination')}>
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('common.previous')}
      </Button>
      <span className="text-sm text-muted-foreground">{t('common.pageOf', { page, pages })}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('common.next')}
      </Button>
    </nav>
  );
}
