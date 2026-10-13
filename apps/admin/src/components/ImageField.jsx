import { PERMISSIONS as P } from '@supershop/shared';
import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { useCan } from '@/lib/permissions';

/**
 * One image chosen from the media library. `value`: `{ id, url, thumbUrl } | null`.
 * The picker is offered only to staff allowed to browse the library.
 */
export function ImageField({ label, value, onChange, error }) {
  const { t } = useTranslation();
  const can = useCan();
  const [picking, setPicking] = useState(false);
  const canPick = [P.MEDIA_MANAGE, P.PRODUCT_CREATE, P.PRODUCT_UPDATE, P.PAGE_MANAGE].some(can);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img src={value.thumbUrl} alt="" className="size-16 rounded-md object-contain" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-md bg-muted">
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          </span>
        )}
        {canPick && (
          <Button type="button" variant="outline" onClick={() => setPicking(true)}>
            {t(value ? 'imageField.change' : 'imageField.choose')}
          </Button>
        )}
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            {t('imageField.remove')}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <MediaPickerDialog
        open={picking}
        onOpenChange={setPicking}
        onSelect={(m) => {
          onChange({ id: m.id, url: m.url, thumbUrl: m.variants.thumb?.url ?? m.url });
          setPicking(false);
        }}
      />
    </div>
  );
}
