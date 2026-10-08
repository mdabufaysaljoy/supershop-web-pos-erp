import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
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
import { CustomFieldForm } from '../components/CustomFieldForm';
import { useFieldDefinitions } from '../resource';

const BACK = { product: '/products' };

/** Extra fields for an entity (products now; customers/checkout later). */
export function CustomFieldsPage({ entity }) {
  const { t } = useTranslation();
  const { data: defs = [], isPending, isError, error } = useFieldDefinitions(entity);
  const [editing, setEditing] = useState(null); // null | 'new' | def

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          {BACK[entity] && (
            <Link
              to={BACK[entity]}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
              {t(`customFields.back.${entity}`)}
            </Link>
          )}
          <h1 className="text-2xl font-semibold">{t(`customFields.title.${entity}`)}</h1>
          <p className="text-sm text-muted-foreground">{t('customFields.description')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {t('customFields.add')}
        </Button>
      </header>
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-32" />
      ) : defs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('customFields.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('customFields.form.label')}</TableHead>
              <TableHead>{t('customFields.form.key')}</TableHead>
              <TableHead>{t('customFields.form.type')}</TableHead>
              <TableHead>{t('customFields.form.visibility')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {defs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => setEditing(d)}
                  >
                    {d.label.en}
                  </button>
                  {d.required && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      {t('customFields.form.required')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{d.key}</TableCell>
                <TableCell>{t(`customFields.types.${d.type}`)}</TableCell>
                <TableCell>{t(`customFields.visibility.${d.visibility}`)}</TableCell>
                <TableCell>
                  <Badge tone={d.isActive ? 'ok' : 'muted'}>
                    {t(d.isActive ? 'common.active' : 'common.inactive')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
          <DialogTitle className="pe-8">
            {editing === 'new' ? t('customFields.newTitle') : editing?.label.en}
          </DialogTitle>
          {editing && (
            <CustomFieldForm
              key={editing === 'new' ? 'new' : editing.id}
              entity={entity}
              def={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
