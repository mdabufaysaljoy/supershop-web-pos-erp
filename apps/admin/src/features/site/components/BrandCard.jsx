import { FormField, PlainTextInput } from '@supershop/ui';
import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { useMediaList } from '@/features/media/hooks';
import { useSaveSettings, useSettings } from '@/features/settings/hooks';
import { useUpdateLayout } from '../resource';

/**
 * Brand & Identity Card (P5.5):
 * Centralized branding controls for Website Name, Site Title Suffix,
 * Header Brand Display Mode (Logo & Name, Only Logo, Only Name),
 * Header Logo, Browser Favicon, and Open Graph sharing picture.
 * All changes persist to settings and site_layout and immediately reflect across the storefront.
 */
const IMAGE_FIELDS = ['logoId', 'faviconId', 'ogImageId'];

const DISPLAY_OPTIONS = [
  {
    id: 'both',
    title: 'Both Logo & Name',
    desc: 'Displays the store logo image side-by-side with your website name.',
  },
  {
    id: 'logo',
    title: 'Only Logo',
    desc: 'Displays only the logo image in the top navigation header.',
  },
  {
    id: 'name',
    title: 'Only Name',
    desc: 'Displays only the store name text in the top navigation header.',
  },
];

export function BrandCard({ layout, disabled }) {
  const { t } = useTranslation();
  const saveLayout = useUpdateLayout();
  const generalSettings = useSettings('general');
  const saveSettings = useSaveSettings();
  const mediaList = useMediaList({ limit: 100 });
  const mediaMap = new Map((mediaList.data?.data ?? []).map((m) => [m.id, m]));

  const [picking, setPicking] = useState(null);

  // 1. Store Name
  const loadedStoreName =
    generalSettings.data?.find((s) => s.key === 'store.name')?.value ?? 'Supershop';
  const [storeNameEdit, setStoreNameEdit] = useState(null);
  const storeNameDraft = storeNameEdit ?? loadedStoreName;

  // 2. Site Title Suffix
  const loadedTitleSuffix =
    typeof layout?.seo?.titleSuffix === 'string'
      ? layout.seo.titleSuffix
      : (layout?.seo?.titleSuffix?.en ?? '');
  const [titleSuffixEdit, setTitleSuffixEdit] = useState(null);
  const titleSuffixDraft = titleSuffixEdit ?? loadedTitleSuffix;

  // 3. Logo Display Mode
  const currentLogoDisplay = layout?.brand?.logoDisplay ?? 'both';

  const handleSaveStoreName = () => {
    if (!storeNameDraft.trim()) return;
    saveSettings.mutate([{ key: 'store.name', value: storeNameDraft.trim() }], {
      onSuccess: () => setStoreNameEdit(null),
    });
  };

  const handleSaveTitleSuffix = () => {
    saveLayout.mutate(
      {
        seo: {
          titleSuffix: titleSuffixDraft.trim(),
        },
      },
      {
        onSuccess: () => setTitleSuffixEdit(null),
      },
    );
  };

  const handleSetLogoDisplay = (mode) => {
    saveLayout.mutate({
      brand: {
        logoDisplay: mode,
      },
    });
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

        {/* Header Brand Display Mode */}
        <div className="border-t pt-4">
          <div className="space-y-1 mb-3">
            <h3 className="text-sm font-semibold">Header Brand Display</h3>
            <p className="text-xs text-muted-foreground">
              Choose how your store brand appears in the storefront top navigation header.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {DISPLAY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled || saveLayout.isPending}
                onClick={() => handleSetLogoDisplay(opt.id)}
                className={`flex flex-col text-start p-3.5 rounded-xl border transition-all ${
                  currentLogoDisplay === opt.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
                    : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-sm font-semibold text-foreground">{opt.title}</span>
                  <span
                    className={`size-2.5 rounded-full ${
                      currentLogoDisplay === opt.id
                        ? 'bg-primary'
                        : 'border border-muted-foreground/40'
                    }`}
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Media / Graphical Assets */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">Store Visual Assets</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {IMAGE_FIELDS.map((field) => {
              const mediaId = layout.brand[field];
              const media = mediaId ? mediaMap.get(mediaId) : null;
              const thumbUrl = media?.variants?.thumb?.url || media?.url;

              return (
                <div
                  key={field}
                  className="flex flex-col justify-between rounded-xl border p-4 bg-muted/20"
                >
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t(`appearance.brand.${field}`)}</span>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {mediaId ? t('appearance.brand.set') : t('appearance.brand.unset')}
                      </span>
                    </div>

                    {/* Live Image Preview */}
                    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-2.5">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          className="size-12 rounded-md object-contain bg-background/80 border p-0.5 shadow-2xs"
                        />
                      ) : (
                        <div className="grid size-12 place-items-center rounded-md bg-muted text-muted-foreground border">
                          <ImageIcon className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {media?.name || (mediaId ? `ID: ${mediaId}` : 'No image uploaded')}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {media?.width ? `${media.width}×${media.height}px` : 'PNG, SVG, WebP'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || saveLayout.isPending}
                      onClick={() => setPicking(field)}
                    >
                      {mediaId ? t('cms.builder.changeImage') : t('cms.builder.chooseImage')}
                    </Button>
                    {mediaId && (
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
              );
            })}
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
