import { PERMISSIONS as P } from '@supershop/shared';
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
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { SupplierForm } from '../components/SupplierForm';
import { suppliers } from '../resource';

const PAGE_SIZE = 25;

/** Suppliers: searchable list (name, contact, email, phone, tax no.) + create/edit dialog. */
export function SuppliersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const canManage = can(P.SUPPLIER_MANAGE);
  const { page, q, go } = useListParams(useSearchParams());
  const { data, isPending, isError, error } = suppliers.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
  });
  const [editing, setEditing] = useState(null); // null | 'new' | supplier
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('suppliers.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('suppliers.description')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {t('suppliers.add')}
          </Button>
        )}
      </header>

      <SearchForm
        initial={q}
        label={t('suppliers.search')}
        onSearch={(v) => go({ q: v, page: 1 })}
      />
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}

      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('suppliers.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('suppliers.form.name')}</TableHead>
              <TableHead>{t('suppliers.form.contactName')}</TableHead>
              <TableHead>{t('suppliers.form.phone')}</TableHead>
              <TableHead>{t('suppliers.form.email')}</TableHead>
              <TableHead>{t('suppliers.terms')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {canManage ? (
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => setEditing(s)}
                    >
                      {s.name}
                    </button>
                  ) : (
                    <span className="font-medium">{s.name}</span>
                  )}
                </TableCell>
                <TableCell>{s.contactName ?? '—'}</TableCell>
                <TableCell dir="ltr" className="text-start">
                  {s.phone ?? '—'}
                </TableCell>
                <TableCell>{s.email ?? '—'}</TableCell>
                <TableCell>{t('suppliers.days', { count: s.paymentTermsDays })}</TableCell>
                <TableCell>
                  <Badge tone={s.isActive ? 'ok' : 'muted'}>
                    {t(s.isActive ? 'common.active' : 'common.inactive')}
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
            {editing === 'new' ? t('suppliers.newTitle') : editing?.name}
          </DialogTitle>
          {editing && (
            <SupplierForm
              key={editing === 'new' ? 'new' : editing.id}
              supplier={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
