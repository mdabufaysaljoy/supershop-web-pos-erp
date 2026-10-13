import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Save / Cancel / two-step Delete row shared by the catalog dialogs. */
export function FormActions({
  isNew,
  busy,
  confirmDelete,
  onAskDelete,
  onDelete,
  deleting,
  onCancel,
  canDelete = true,
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={busy}>
        {t(isNew ? 'common.create' : 'common.save')}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      {!isNew &&
        canDelete &&
        (confirmDelete ? (
          <span className="ms-auto flex items-center gap-2">
            <span className="text-sm">{t('common.confirmDelete')}</span>
            <Button type="button" variant="destructive" disabled={deleting} onClick={onDelete}>
              {t('common.delete')}
            </Button>
          </span>
        ) : (
          <Button type="button" variant="outline" className="ms-auto" onClick={onAskDelete}>
            {t('common.delete')}
          </Button>
        ))}
    </div>
  );
}
