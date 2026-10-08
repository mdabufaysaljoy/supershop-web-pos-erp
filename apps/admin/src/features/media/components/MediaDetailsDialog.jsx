import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fmt, formatBytes } from '@/lib/format';
import { fieldMessage } from '@/lib/i18n';
import { useDeleteMedia, useUpdateMedia } from '../hooks';

/**
 * Details + edit for one item: display name and English alt text (Arabic alt is generated
 * automatically — shown read-only with its status), public URLs, delete.
 */
export function MediaDetailsDialog({ media, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog open={Boolean(media)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        {/* keyed so the form re-initializes for each item */}
        {media && <DetailsBody key={media.id} media={media} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailsBody({ media, onClose }) {
  const { t } = useTranslation();
  const update = useUpdateMedia();
  const remove = useDeleteMedia();
  const [form, setForm] = useState({ name: media.name, alt: media.alt?.en ?? '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errors = Object.fromEntries(
    (update.error?.details ?? []).map((d) => [d.path.split('.')[0], d.message]),
  );

  const save = (e) => {
    e.preventDefault();
    const body = {};
    if (form.name !== media.name) body.name = form.name;
    if (form.alt !== (media.alt?.en ?? '')) body.alt = form.alt;
    if (Object.keys(body).length) update.mutate({ id: media.id, body });
  };
  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('media.details.copied'));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  return (
    <>
      <div className="grid gap-1 pe-8">
        <DialogTitle className="truncate">{media.name}</DialogTitle>
        <DialogDescription>
          {t('media.dimensions', { width: media.width, height: media.height })} ·{' '}
          {formatBytes(media.bytes)} · {fmt.dateTime(media.createdAt)}
        </DialogDescription>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex items-center justify-center overflow-hidden rounded-md bg-muted">
          <img
            src={media.variants.md?.url ?? media.url}
            alt={media.alt?.en ?? ''}
            className="max-h-80 max-w-full object-contain"
          />
        </div>

        <form className="grid content-start gap-4" onSubmit={save} noValidate>
          <FormField label={t('media.details.name')} error={fieldMessage(t, errors.name)}>
            <PlainTextInput
              value={form.name}
              maxLength={200}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('media.details.alt')}
            description={t('media.details.altHint')}
            error={fieldMessage(t, errors.alt)}
          >
            <PlainTextInput
              value={form.alt}
              maxLength={250}
              onChange={(e) => setForm({ ...form, alt: e.target.value })}
            />
          </FormField>
          <ArabicPreview label={t('media.details.altArabic')} value={media.alt} />
          <div>
            <Button type="submit" disabled={update.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">{t('media.details.sizes')}</h3>
        <ul className="grid gap-1 text-sm">
          {Object.entries(media.variants).map(([name, v]) => (
            <li key={name} className="flex flex-wrap items-center gap-2">
              <span className="w-16 font-mono text-xs">{name}</span>
              <span className="text-muted-foreground">
                {t('media.dimensions', { width: v.width, height: v.height })} ·{' '}
                {formatBytes(v.bytes)}
              </span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => copy(v.url)}>
                {t('media.details.copyUrl')}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {confirmDelete ? (
          <>
            <span className="text-sm">{t('media.details.confirmDelete')}</span>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(media.id, { onSuccess: onClose })}
            >
              {t('common.delete')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        )}
      </div>
    </>
  );
}
