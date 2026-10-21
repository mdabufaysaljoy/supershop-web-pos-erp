import {
  buildReceiptTemplate,
  charsForWidth,
  DEFAULT_RECEIPT_CONFIG,
  previewLines,
  PRINTING,
  receiptData,
  RECEIPT_LANGUAGES,
  renderTemplate,
  zatcaQr,
} from '@supershop/shared';
import { FormField, PlainTextInput, QrCode } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { useUpdateReceiptTemplate } from '../resource';

/** How big a QR prints on the narrowest paper this preview shows, in CSS pixels. */
const QR_PREVIEW_PX = 180;

/** The paper's own margin, in millimetres, as a thermal printer leaves it. */
const PAPER_PADDING_MM = 3;

const FIELD_KEYS = [
  'showAddress',
  'showPhone',
  'showVatNumber',
  'showBranch',
  'showCashier',
  'showCustomer',
  'showSku',
  'showVatBreakdown',
  'showQr',
  'showOnlineReceipt',
];

const SAMPLE_SALE = {
  orderNo: 'POS-000042',
  placedAt: '2026-10-14T14:30:00.000Z',
  cashierName: 'Sarah',
  branchName: 'Main store',
  totals: {
    itemCount: 2,
    subtotal: 23_000,
    discountTotal: 1500,
    net: 18_696,
    vat: 2804,
    total: 21_500,
  },
  items: [
    {
      name: 'Oxford Shirt',
      sku: 'OX-RED-L',
      qty: 2,
      unitPrice: 11_500,
      discountTotal: 1500,
      lineTotal: 21_500,
    },
  ],
  payments: [{ label: 'Cash', amount: 25_000 }],
  changeGiven: 3500,
  customer: { customerId: 'sample', name: 'walk-in' },
};

/**
 * Settings → Printing: Receipt template editor (language en/ar/bilingual, paper size in mm, logo,
 * header/footer text, field toggles, and live thermal receipt + ZATCA QR preview) (P6.4).
 */
export function ReceiptTemplateCard({ template, shopName, vatNumber, canEdit }) {
  const { t } = useTranslation();
  const update = useUpdateReceiptTemplate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState({});

  const lang = draft.lang ?? template?.lang ?? DEFAULT_RECEIPT_CONFIG.lang;
  const widthMm = draft.widthMm ?? template?.widthMm ?? DEFAULT_RECEIPT_CONFIG.widthMm;
  const headerEn =
    draft.headerText ?? template?.headerText?.en ?? DEFAULT_RECEIPT_CONFIG.headerText.en;
  const footerEn =
    draft.footerText ?? template?.footerText?.en ?? DEFAULT_RECEIPT_CONFIG.footerText.en;
  const fields = {
    ...DEFAULT_RECEIPT_CONFIG.fields,
    ...template?.fields,
    ...draft.fields,
  };
  const logo = draft.logo !== undefined ? draft.logo : (template?.logo ?? null);
  const logoMediaId =
    draft.logoMediaId !== undefined ? draft.logoMediaId : (template?.logoMediaId ?? null);

  const previewShop = {
    name: shopName || 'Supershop',
    address: 'Riyadh',
    phone: '+966500000000',
    vatNumber: vatNumber || '300000000000003',
  };
  const qr = fields.showQr
    ? zatcaQr({
        sellerName: previewShop.name,
        vatNumber: previewShop.vatNumber,
        timestamp: SAMPLE_SALE.placedAt,
        total: SAMPLE_SALE.totals.total,
        vat: SAMPLE_SALE.totals.vat,
      })
    : '';
  const onlineReceiptUrl = fields.showOnlineReceipt
    ? `http://localhost:3000/${lang === 'ar' ? 'ar' : 'en'}/receipt/${SAMPLE_SALE.orderNo}`
    : '';
  const data = receiptData(
    { ...SAMPLE_SALE, zatcaQr: qr, onlineReceiptUrl },
    {
      shop: previewShop,
      currency: 'SAR',
      lang: lang === 'ar' ? 'ar' : 'en',
      storefrontUrl: 'http://localhost:3000',
    },
  );
  const compiled = buildReceiptTemplate(
    {
      lang,
      widthMm,
      headerText: { ...(template?.headerText ?? {}), en: headerEn },
      footerText: { ...(template?.footerText ?? {}), en: footerEn },
      fields,
      labels: template?.labels ?? DEFAULT_RECEIPT_CONFIG.labels,
    },
    { lang },
  );
  const chars = charsForWidth(widthMm);
  const lines = previewLines(renderTemplate(compiled, data, { widthMm }));

  const toggleField = (key, checked) =>
    setDraft((s) => ({
      ...s,
      fields: { ...(s.fields ?? {}), [key]: checked },
    }));

  const handleSave = (e) => {
    e.preventDefault();
    update.mutate(
      {
        lang,
        widthMm: Number(widthMm),
        logoMediaId,
        headerText: headerEn,
        footerText: footerEn,
        fields,
      },
      { onSuccess: () => setDraft({}) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('printing.receipt.title')}</h2>
        </CardTitle>
        <CardDescription>{t('printing.receipt.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <form onSubmit={handleSave} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('printing.receipt.language')}>
                <Select
                  value={lang}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((s) => ({ ...s, lang: e.target.value }))}
                >
                  {RECEIPT_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {t(`printing.receipt.languages.${l}`)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label={t('printing.receipt.paperWidth')}>
                <Select
                  value={widthMm}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((s) => ({ ...s, widthMm: Number(e.target.value) }))}
                >
                  {PRINTING.WIDTHS_MM.map((w) => (
                    <option key={w} value={w}>
                      {t('printing.profiles.mm', { mm: w })} ({charsForWidth(w)}{' '}
                      {t('printing.receipt.chars')})
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('printing.receipt.logo')}</span>
              <div className="flex flex-wrap items-center gap-3">
                {logo?.url && (
                  <img
                    src={logo.url}
                    alt={logo.alt || t('printing.receipt.logo')}
                    className="h-10 rounded border object-contain px-2"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => setPickerOpen(true)}
                >
                  {logo ? t('printing.receipt.changeLogo') : t('printing.receipt.chooseLogo')}
                </Button>
                {logoMediaId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit}
                    onClick={() => setDraft((s) => ({ ...s, logoMediaId: null, logo: null }))}
                  >
                    {t('printing.receipt.removeLogo')}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <FormField label={t('printing.receipt.headerText')}>
                  <PlainTextInput
                    placeholder={t('printing.receipt.headerPlaceholder')}
                    value={headerEn}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((s) => ({ ...s, headerText: e.target.value }))}
                  />
                </FormField>
                <ArabicPreview
                  label={t('printing.receipt.arabicPreview')}
                  value={template?.headerText}
                />
              </div>

              <div className="grid gap-2">
                <FormField label={t('printing.receipt.footerText')}>
                  <PlainTextInput
                    placeholder={t('printing.receipt.footerPlaceholder')}
                    value={footerEn}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((s) => ({ ...s, footerText: e.target.value }))}
                  />
                </FormField>
                <ArabicPreview
                  label={t('printing.receipt.arabicPreview')}
                  value={template?.footerText}
                />
              </div>
            </div>

            <fieldset className="grid gap-3 border-t pt-4">
              <legend className="text-sm font-medium">{t('printing.receipt.fieldsTitle')}</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELD_KEYS.map((key) => (
                  <Checkbox
                    key={key}
                    id={`receipt-field-${key}`}
                    label={t(`printing.receipt.fields.${key}`)}
                    checked={Boolean(fields[key])}
                    disabled={!canEdit}
                    onChange={(e) => toggleField(key, e.target.checked)}
                  />
                ))}
              </div>
            </fieldset>

            {canEdit && (
              <div>
                <Button type="submit" disabled={update.isPending}>
                  {t('printing.receipt.saveButton')}
                </Button>
              </div>
            )}
          </form>

          <div
            data-testid="receipt-preview"
            aria-label={t('printing.receipt.previewTitle')}
            className="grid gap-3 rounded-lg border bg-muted/30 p-4"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium">{t('printing.receipt.previewTitle')}</span>
              <span>
                {t('printing.profiles.mm', { mm: widthMm })} · {chars} {t('printing.receipt.chars')}
              </span>
            </div>
            {/*
              A thermal slip is a fixed number of monospace characters on a fixed paper width, so
              the preview is sized in millimetres and the font is scaled to fit exactly that many
              characters. Anything else clips the rules and the totals column.
            */}
            <div
              className="mx-auto overflow-hidden rounded border bg-white text-black shadow-xs"
              style={{ width: `${widthMm}mm`, maxWidth: '100%', padding: `${PAPER_PADDING_MM}mm` }}
            >
              {logo?.url && (
                <img
                  src={logo.url}
                  alt={logo.alt || t('printing.receipt.logo')}
                  className="mx-auto mb-2 max-h-12 object-contain"
                />
              )}
              <pre
                dir="ltr"
                className="font-mono leading-snug whitespace-pre"
                style={{
                  fontSize: `calc((${widthMm}mm - ${PAPER_PADDING_MM * 2}mm) / ${chars} / 0.6)`,
                }}
              >
                {lines.join('\n')}
              </pre>
              {qr && (
                <div
                  data-testid="receipt-preview-qr"
                  className="mt-3 flex flex-col items-center gap-1"
                >
                  <QrCode
                    value={qr}
                    size={QR_PREVIEW_PX}
                    title={t('printing.receipt.zatcaQrCaption')}
                  />
                  <span className="text-[10px] text-neutral-500">
                    {t('printing.receipt.zatcaQrCaption')}
                  </span>
                </div>
              )}
              {fields.showOnlineReceipt && (
                <div
                  data-testid="receipt-preview-online-qr"
                  className="mt-3 flex flex-col items-center gap-1 border-t border-dashed border-neutral-200 pt-3"
                >
                  <QrCode
                    value={onlineReceiptUrl}
                    size={QR_PREVIEW_PX}
                    title={t('printing.receipt.onlineReceiptQrCaption')}
                  />
                  <span className="text-center text-[10px] font-semibold text-emerald-700">
                    {t('printing.receipt.onlineReceiptQrCaption')}
                  </span>
                  <span className="font-mono text-[9px] text-neutral-400">{onlineReceiptUrl}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <MediaPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(media) => {
            if (media) {
              setDraft((s) => ({
                ...s,
                logoMediaId: media.id,
                logo: { id: media.id, url: media.url, alt: media.alt ?? '' },
              }));
            }
            setPickerOpen(false);
          }}
        />
      </CardContent>
    </Card>
  );
}
