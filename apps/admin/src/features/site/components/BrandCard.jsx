import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { useUpdateLayout } from '../resource';

/**
 * The pictures a shop sets once (P5.5): the header logo, the browser icon, and the picture used
 * when one of its pages is shared. Each one is saved as soon as it is chosen — there is nothing
 * else to fill in, so a Save button would only be in the way.
 */
const FIELDS = ['logoId', 'faviconId', 'ogImageId'];

export function BrandCard({ layout, disabled }) {
  const { t } = useTranslation();
  const save = useUpdateLayout();
  const [picking, setPicking] = useState(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.brand.title')}</CardTitle>
        <CardDescription>{t('appearance.brand.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field} className="grid gap-2">
            <span className="text-sm font-medium">{t(`appearance.brand.${field}`)}</span>
            <span className="text-sm text-muted-foreground">
              {layout.brand[field] ? t('appearance.brand.set') : t('appearance.brand.unset')}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || save.isPending}
                onClick={() => setPicking(field)}
              >
                {layout.brand[field] ? t('cms.builder.changeImage') : t('cms.builder.chooseImage')}
              </Button>
              {layout.brand[field] && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || save.isPending}
                  onClick={() => save.mutate({ brand: { [field]: null } })}
                >
                  {t('common.remove')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      {picking && (
        <MediaPickerDialog
          open
          onOpenChange={() => setPicking(null)}
          onSelect={(media) => {
            save.mutate({ brand: { [picking]: media.id } });
            setPicking(null);
          }}
        />
      )}
    </Card>
  );
}
