import { barcodeType, DEFAULT_LABEL_CONFIG } from '@supershop/shared';
import { Barcode } from '@supershop/ui';
import { Minus, Plus, Printer, Tag } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  usePrintingStatus,
  usePrintingTemplates,
  usePrintLabel,
} from '@/features/printing/resource';
import { useSettings } from '@/features/settings/hooks';
import { fmt } from '@/lib/format';

/**
 * Barcode & Shelf Label Print Dialog:
 * Displays product variant barcode label preview with store name, product name, variant, price,
 * and barcode. Allows cashier/manager to specify number of pieces to print and triggers printing
 * according to settings configuration (QZ hardware label printer and browser printing).
 */
export function BarcodePreviewDialog({
  code,
  variantLabel,
  label, // alias for backwards compatibility
  productName = '',
  sku = '',
  price = '',
  currency = 'SAR',
  onClose,
}) {
  const { t } = useTranslation();
  const [pieces, setPieces] = useState(1);
  const { data: generalSettings } = useSettings('general');
  const { data: templates } = usePrintingTemplates();
  const printingStatus = usePrintingStatus();
  const printLabel = usePrintLabel();

  const activeVariantLabel = variantLabel || label || '';
  const storeName = generalSettings?.find?.((s) => s.key === 'store.name')?.value || 'Supershop';
  const labelTpl = templates?.label ?? templates?.data?.label;

  const widthMm = labelTpl?.widthMm ?? DEFAULT_LABEL_CONFIG.widthMm;
  const heightMm = labelTpl?.heightMm ?? DEFAULT_LABEL_CONFIG.heightMm;
  const barcodeHeight = labelTpl?.barcodeHeight ?? DEFAULT_LABEL_CONFIG.barcodeHeight;

  const priceMinor =
    typeof price === 'number' ? price : price ? Math.round(Number(price) * 100) : 0;

  const formattedPrice = priceMinor > 0 ? fmt.money(priceMinor, { currency }) : '';

  const handlePrint = () => {
    const copies = Math.max(1, Math.min(500, Number(pieces) || 1));

    // If QZ Tray / hardware printing is enabled, send label job to configured label printer
    if (printingStatus.data?.enabled) {
      printLabel.mutate({
        name: productName || activeVariantLabel || t('products.barcodes.product', 'Product'),
        variant: activeVariantLabel,
        sku: sku || undefined,
        barcode: code,
        price: priceMinor,
        copies,
      });
    }

    // Trigger browser print for immediate printout
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handlePiecesChange = (val) => {
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 1) {
      setPieces(1);
    } else {
      setPieces(Math.min(500, num));
    }
  };

  return (
    <Dialog open={Boolean(code)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} className="max-w-md p-6">
        {code && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Tag className="size-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    {activeVariantLabel || t('products.barcodes.labelTitle', 'Barcode Label')}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span>{t(`products.barcodes.type.${barcodeType(code)}`)}</span>
                    <span>·</span>
                    <span>
                      {widthMm} × {heightMm} mm
                    </span>
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Label Visual Preview (Styled according to settings configuration) */}
            <div className="flex justify-center py-3 bg-slate-50/70 rounded-lg border border-slate-100">
              <div
                className="flex flex-col items-center justify-center gap-1 rounded-md border border-slate-300 bg-white p-3 text-center text-slate-900 shadow-sm"
                style={{
                  width: `${Math.min(320, Math.max(220, widthMm * 4.2))}px`,
                  minHeight: `${Math.min(220, Math.max(120, heightMm * 4))}px`,
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {storeName}
                </span>
                {productName && (
                  <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                    {productName}
                  </span>
                )}
                {activeVariantLabel && activeVariantLabel !== 'Default' && (
                  <span className="text-[11px] font-medium text-slate-600">
                    {activeVariantLabel}
                  </span>
                )}
                {formattedPrice && (
                  <span className="text-sm font-extrabold text-slate-900 tabular-nums">
                    {formattedPrice}
                  </span>
                )}
                <div className="my-1 flex justify-center max-w-full">
                  <Barcode
                    value={code}
                    height={Math.min(56, Math.max(28, Math.round(Number(barcodeHeight) * 0.7)))}
                    moduleWidth={1.5}
                    showText={true}
                    className="max-w-full"
                  />
                </div>
                {sku && <span className="font-mono text-[10px] text-slate-400">SKU: {sku}</span>}
              </div>
            </div>

            {/* Pieces Selector & Configuration Hint */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <label htmlFor="label-pieces-input" className="text-xs font-semibold text-slate-700">
                {t('products.barcodes.pieces', 'Pieces to print')}
              </label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-md text-slate-600"
                  disabled={pieces <= 1}
                  onClick={() => setPieces((p) => Math.max(1, p - 1))}
                  aria-label="Decrease pieces"
                >
                  <Minus className="size-3.5" />
                </Button>
                <input
                  id="label-pieces-input"
                  type="number"
                  min={1}
                  max={500}
                  value={pieces}
                  onChange={(e) => handlePiecesChange(e.target.value)}
                  className="h-8 w-14 rounded-md border border-slate-200 text-center text-xs font-bold text-slate-900 outline-none focus:border-primary"
                  aria-label={t('products.barcodes.pieces', 'Pieces to print')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-md text-slate-600"
                  disabled={pieces >= 500}
                  onClick={() => setPieces((p) => Math.min(500, p + 1))}
                  aria-label="Increase pieces"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Dialog Footer Actions: Print & Cancel (No Download button!) */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" size="sm" className="gap-1.5 font-bold" onClick={handlePrint}>
                <Printer className="size-4" aria-hidden />
                {t('products.barcodes.print', 'Print')}
              </Button>
            </div>

            {/* Hidden Printable Container for Browser Print (N label pages) */}
            <div id="product-label-printable" aria-hidden="true" className="hidden print:block">
              {Array.from({ length: Math.max(1, Number(pieces) || 1) }).map((_, idx) => (
                <div
                  key={idx}
                  className="product-label-page"
                  style={{
                    width: `${widthMm}mm`,
                    height: `${heightMm}mm`,
                    padding: '2mm',
                  }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-wider text-center">
                    {storeName}
                  </div>
                  {productName && (
                    <div className="text-[10px] font-bold text-center leading-tight line-clamp-2">
                      {productName}
                    </div>
                  )}
                  {activeVariantLabel && activeVariantLabel !== 'Default' && (
                    <div className="text-[9px] text-center">{activeVariantLabel}</div>
                  )}
                  {formattedPrice && (
                    <div className="text-[11px] font-extrabold text-center tabular-nums">
                      {formattedPrice}
                    </div>
                  )}
                  <div className="my-0.5 flex justify-center">
                    <Barcode
                      value={code}
                      height={Math.min(48, Math.max(24, Math.round(Number(barcodeHeight) * 0.6)))}
                      moduleWidth={1.2}
                      showText={true}
                    />
                  </div>
                  {sku && <div className="text-[8px] font-mono text-center">SKU: {sku}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
