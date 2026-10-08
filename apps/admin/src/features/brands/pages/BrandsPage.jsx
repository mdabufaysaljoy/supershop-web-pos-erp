import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/i18n';
import { useListParams } from '@/lib/useListParams';
import { BrandForm } from '../components/BrandForm';
import { brands } from '../resource';

const PAGE_SIZE = 25;

/** Brands: searchable list + create/edit dialog. List state lives in the URL (?q&page). */
export function BrandsPage() {
  const { t } = useTranslation();
  const { page, q, go } = useListParams(useSearchParams());
  const { data, isPending, isError, error } = brands.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
  });
  const [editing, setEditing] = useState(null); // null | 'new' | brand
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('brands.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('brands.description')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {t('brands.add')}
        </Button>
      </header>

      <SearchForm initial={q} label={t('brands.search')} onSearch={(v) => go({ q: v, page: 1 })} />
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}

      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('brands.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <span className="sr-only">{t('brands.form.logo')}</span>
              </TableHead>
              <TableHead>{t('brands.form.name')}</TableHead>
              <TableHead>{t('categories.form.slug')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  {b.logo ? (
                    <img src={b.logo.thumbUrl} alt="" className="size-8 rounded object-contain" />
                  ) : (
                    <span className="block size-8 rounded bg-muted" aria-hidden />
                  )}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => setEditing(b)}
                  >
                    {b.name}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{b.slug}</TableCell>
                <TableCell>
                  <Badge tone={b.isActive ? 'ok' : 'muted'}>
                    {t(b.isActive ? 'common.active' : 'categories.hidden')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
          <DialogTitle className="pe-8">
            {editing === 'new' ? t('brands.newTitle') : editing?.name}
          </DialogTitle>
          {editing && (
            <BrandForm
              key={editing === 'new' ? 'new' : editing.id}
              brand={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
