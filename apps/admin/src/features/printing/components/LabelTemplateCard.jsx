import { DEFAULT_LABEL_CONFIG, labelData, PRINTING } from '@supershop/shared';
import { Barcode, FormField, IntegerInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/features/settings/components/controls';
import { usePrintLabel, useUpdateLabelTemplate } from '../resource';

const LABEL_FIELD_KEYS = [
  'showShopName',
  'showName',
  'showVariant',
  'showPrice',
  'showSku',
  'showBarcodeText',
];

const SAMPLE_ITEM = {
  name: 'Oxford Shirt',
  variant: 'Red / L',
  sku: 'OX-RED-L',
  barcode: '6281000000014',
  price: 11_500,
};

/**
 * Settings → Printing: Barcode shelf/product label template editor (size in mm, barcode height,
 * field checkboxes, live label preview, and test label print) (P6.4).
 */
export function LabelTemplateCard({ template, shopName, canEdit }) {
  const { t } = useTranslation();
  const update = useUpdateLabelTemplate();
  const printLabel = usePrintLabel();
  const [draft, setDraft] = useState({});

  const widthMm = draft.widthMm ?? template?.widthMm ?? DEFAULT_LABEL_CONFIG.widthMm;
  const heightMm = draft.heightMm ?? template?.heightMm ?? DEFAULT_LABEL_CONFIG.heightMm;
  const barcodeHeight =
    draft.barcodeHeight ?? template?.barcodeHeight ?? DEFAULT_LABEL_CONFIG.barcodeHeight;
  const fields = {
    ...DEFAULT_LABEL_CONFIG.fields,
    ...template?.fields,
    ...draft.fields,
  };

  const sample = labelData(SAMPLE_ITEM, {
    shop: { name: shopName || 'Supershop' },
    currency: 'SAR',
  });

  const toggleField = (key, checked) =>
    setDraft((s) => ({
      ...s,
      fields: { ...(s.fields ?? {}), [key]: checked },
    }));

  const handleSave = (e) => {
    e.preventDefault();
    update.mutate(
      {
        widthMm: Number(widthMm),
        heightMm: Number(heightMm),
        barcodeHeight: Number(barcodeHeight),
        fields,
      },
      { onSuccess: () => setDraft({}) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('printing.label.title')}</h2>
        </CardTitle>
        <CardDescription>{t('printing.label.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <form onSubmit={handleSave} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label={t('printing.label.widthMm')}
                description={`${PRINTING.LABEL_WIDTH_MIN}–${PRINTING.LABEL_WIDTH_MAX} mm`}
              >
                <IntegerInput
                  value={String(widthMm)}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, widthMm: Number(e.target.value || 0) }))
                  }
                />
              </FormField>

              <FormField
                label={t('printing.label.heightMm')}
                description={`${PRINTING.LABEL_HEIGHT_MIN}–${PRINTING.LABEL_HEIGHT_MAX} mm`}
              >
                <IntegerInput
                  value={String(heightMm)}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, heightMm: Number(e.target.value || 0) }))
                  }
                />
              </FormField>

              <FormField
                label={t('printing.label.barcodeHeight')}
                description={`${PRINTING.BARCODE_HEIGHT_MIN}–${PRINTING.BARCODE_HEIGHT_MAX} dots`}
              >
                <IntegerInput
                  value={String(barcodeHeight)}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, barcodeHeight: Number(e.target.value || 0) }))
                  }
                />
              </FormField>
            </div>

            <fieldset className="grid gap-3 border-t pt-4">
              <legend className="text-sm font-medium">{t('printing.label.fieldsTitle')}</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {LABEL_FIELD_KEYS.map((key) => (
                  <Checkbox
                    key={key}
                    id={`label-field-${key}`}
                    label={t(`printing.label.fields.${key}`)}
                    checked={Boolean(fields[key])}
                    disabled={!canEdit}
                    onChange={(e) => toggleField(key, e.target.checked)}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-3">
              {canEdit && (
                <Button type="submit" disabled={update.isPending}>
                  {t('printing.label.saveButton')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={printLabel.isPending}
                onClick={() => printLabel.mutate({ ...SAMPLE_ITEM, copies: 1 })}
              >
                {t('printing.label.testPrint')}
              </Button>
            </div>
          </form>

          <div
            data-testid="label-preview"
            aria-label={t('printing.label.previewTitle')}
            className="grid gap-3 rounded-lg border bg-muted/30 p-4"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium">{t('printing.label.previewTitle')}</span>
              <span>
                {widthMm} × {heightMm} mm
              </span>
            </div>
            <div
              className="mx-auto flex w-full max-w-xs flex-col items-center justify-center gap-1 rounded border bg-white p-3 text-center text-black shadow-xs"
              style={{ minHeight: `${Math.max(96, Number(heightMm) * 3)}px` }}
            >
              {fields.showShopName && (
                <span className="text-[11px] text-neutral-600">{sample.shopName}</span>
              )}
              {fields.showName && <span className="text-xs font-bold">{sample.name}</span>}
              {fields.showVariant && <span className="text-[11px]">{sample.variant}</span>}
              {fields.showPrice && (
                <span className="text-sm font-semibold tabular-nums">{sample.price}</span>
              )}
              <Barcode
                value={sample.barcode}
                height={Math.min(80, Math.max(28, Math.round(Number(barcodeHeight) * 0.7)))}
                moduleWidth={1.5}
                showText={Boolean(fields.showBarcodeText)}
                className="max-w-full"
              />
              {fields.showSku && <span className="font-mono text-[10px]">SKU: {sample.sku}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
