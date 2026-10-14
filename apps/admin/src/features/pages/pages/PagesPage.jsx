import { PERMISSIONS as P } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';
import { pages } from '../resource';

/** The shop's pages. The builder that edits them arrives with P5.2. */
export function PagesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const { data, isPending } = pages.useList({ page: 1, limit: 50 });
  const items = data?.data ?? [];

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('cms.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('cms.description')}</p>
      </header>

      {isPending ? (
        <Skeleton className="h-48" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('cms.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('cms.pageTitle')}</TableHead>
              <TableHead>{t('cms.address')}</TableHead>
              <TableHead>{t('cms.statusLabel')}</TableHead>
              <TableHead>{t('cms.blocks')}</TableHead>
              <TableHead>{t('cms.updated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((page) => (
              <TableRow key={page.id}>
                <TableCell>
                  {can(P.PAGE_VIEW) ? (
                    <Link to={`/pages/${page.id}`} className="font-medium hover:underline">
                      {page.title?.en ?? page.slug}
                    </Link>
                  ) : (
                    page.title?.en
                  )}
                  {page.isHome && <Badge tone="info">{t('cms.home')}</Badge>}
                </TableCell>
                <TableCell dir="ltr" className="text-muted-foreground">
                  /p/{page.slug}
                </TableCell>
                <TableCell>
                  <Badge tone={page.status === 'published' ? 'ok' : 'muted'}>
                    {t(`cms.status.${page.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>{fmt.number(page.blockCount)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt.dateTime(page.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
