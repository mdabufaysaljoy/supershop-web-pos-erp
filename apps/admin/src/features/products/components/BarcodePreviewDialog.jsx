import { barcodeSvg, barcodeType } from '@supershop/shared';
import { Barcode } from '@supershop/ui';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/** Shows a variant's barcode as it will print, with an SVG download (labels come in P6.4). */
export function BarcodePreviewDialog({ code, label, onClose }) {
  const { t } = useTranslation();
  let svg = null;
  try {
    svg = code ? barcodeSvg(code, { moduleWidth: 2, height: 80 }) : null;
  } catch {
    svg = null;
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${code}.svg` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open={Boolean(code)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} className="max-w-lg">
        {code && (
          <>
            <div className="grid gap-1 pe-8">
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                {svg
                  ? t(`products.barcodes.type.${barcodeType(code)}`)
                  : t('products.barcodes.cannotDraw')}
              </DialogDescription>
            </div>
            {svg && (
              <>
                <div className="flex justify-center overflow-x-auto rounded-md border bg-white p-4">
                  <Barcode value={code} height={80} />
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={download}>
                    <Download className="size-4" aria-hidden />
                    {t('products.barcodes.downloadSvg')}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
