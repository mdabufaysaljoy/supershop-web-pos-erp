import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { useSaveSettings, useSettings } from '@/features/settings/hooks';
import { useUpdateLayout } from '../resource';

/**
 * Brand & Identity Card (P5.5):
 * Centralized branding controls for Website Name, Site Title Suffix,
 * Header Logo, Browser Favicon, and Open Graph sharing picture.
 * All changes persist to settings and site_layout and immediately reflect across the storefront.
 */
const IMAGE_FIELDS = ['logoId', 'faviconId', 'ogImageId'];

export function BrandCard({ layout, disabled }) {
  const { t } = useTranslation();
  const saveLayout = useUpdateLayout();
  const generalSettings = useSettings('general');
  const saveSettings = useSaveSettings();

  const [picking, setPicking] = useState(null);

  // 1. Store Name
  const loadedStoreName =
    generalSettings.data?.find((s) => s.key === 'store.name')?.value ?? 'Supershop';
  const [storeNameEdit, setStoreNameEdit] = useState(null);
  const storeNameDraft = storeNameEdit ?? loadedStoreName;

  // 2. Site Title Suffix
  const loadedTitleSuffix = layout?.seo?.titleSuffix?.en ?? '';
  const [titleSuffixEdit, setTitleSuffixEdit] = useState(null);
  const titleSuffixDraft = titleSuffixEdit ?? loadedTitleSuffix;

  const handleSaveStoreName = () => {
    if (!storeNameDraft.trim()) return;
    saveSettings.mutate({
      changes: { 'store.name': storeNameDraft.trim() },
    });
    setStoreNameEdit(null);
  };

  const handleSaveTitleSuffix = () => {
    saveLayout.mutate({
      seo: {
        ...layout.seo,
        titleSuffix: titleSuffixDraft.trim(),
      },
    });
    setTitleSuffixEdit(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.brand.title')}</CardTitle>
        <CardDescription>
          Customize your website name, browser tab icon, store logo, and site title.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* Core Identity Text Fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FormField
              label="Website Name"
              description="Shown in headers, customer invoices, emails, and footers."
            >
              <div className="flex gap-2">
                <PlainTextInput
                  value={storeNameDraft}
                  disabled={disabled || generalSettings.isLoading || saveSettings.isPending}
                  onChange={(e) => setStoreNameEdit(e.target.value)}
                  placeholder="Supershop"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    disabled ||
                    saveSettings.isPending ||
                    storeNameDraft.trim() === loadedStoreName ||
                    !storeNameDraft.trim()
                  }
                  onClick={handleSaveStoreName}
                >
                  {saveSettings.isPending ? 'Saving...' : 'Save Name'}
                </Button>
              </div>
            </FormField>
          </div>

          <div className="space-y-2">
            <FormField
              label="Site Title (Suffix)"
              description="Appears in browser tabs and search engine title tags."
            >
              <div className="flex gap-2">
                <PlainTextInput
                  value={titleSuffixDraft}
                  disabled={disabled || saveLayout.isPending}
                  onChange={(e) => setTitleSuffixEdit(e.target.value)}
                  placeholder="Supershop KSA"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    disabled || saveLayout.isPending || titleSuffixDraft === loadedTitleSuffix
                  }
                  onClick={handleSaveTitleSuffix}
                >
                  {saveLayout.isPending ? 'Saving...' : 'Save Title'}
                </Button>
              </div>
            </FormField>
          </div>
        </div>

        {/* Media / Graphical Assets */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">Store Visual Assets</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {IMAGE_FIELDS.map((field) => (
              <div
                key={field}
                className="flex flex-col justify-between rounded-xl border p-4 bg-muted/20"
              >
                <div className="space-y-1 mb-3">
                  <span className="text-sm font-medium">{t(`appearance.brand.${field}`)}</span>
                  <p className="text-xs text-muted-foreground">
                    {layout.brand[field] ? t('appearance.brand.set') : t('appearance.brand.unset')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || saveLayout.isPending}
                    onClick={() => setPicking(field)}
                  >
                    {layout.brand[field]
                      ? t('cms.builder.changeImage')
                      : t('cms.builder.chooseImage')}
                  </Button>
                  {layout.brand[field] && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || saveLayout.isPending}
                      onClick={() => saveLayout.mutate({ brand: { [field]: null } })}
                    >
                      {t('common.remove')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      {picking && (
        <MediaPickerDialog
          open
          onOpenChange={() => setPicking(null)}
          onSelect={(media) => {
            saveLayout.mutate({ brand: { [picking]: media.id } });
            setPicking(null);
          }}
        />
      )}
    </Card>
  );
}
