import { Barcode, QrCode } from '@supershop/ui';
import { CreditCard, Printer, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LOYALTY_TIER_TONE } from '@/features/customers/status';
import { usePrintingStatus, usePrintLoyaltyCard } from '@/features/printing/resource';
import { useSettings } from '@/features/settings/hooks';
import { fmt } from '@/lib/format';

/**
 * The member's loyalty card: what the customer carries, and what a cashier scans to attach them
 * to a sale. On screen it shows the whole card; what PRINTS is the label the shop's own label
 * printer can make — the member's number as a Code 128 barcode — sent to that printer as bytes,
 * never through the browser's print dialog (a browser cannot drive a thermal printer, and an
 * 80 mm label rendered onto A4 is not a card).
 */
export function LoyaltyCardModal({ open, onClose, customer, account }) {
  const { t } = useTranslation();
  const { data: generalSettings } = useSettings('general');
  const printCard = usePrintLoyaltyCard();
  const printing = usePrintingStatus();
  const storeName = generalSettings?.find?.((s) => s.key === 'store.name')?.value || 'SUPERSHOP';

  if (!customer) return null;

  const cardNumber =
    account?.cardNumber || customer?.loyalty?.account?.cardNumber || 'LOY-00000000';
  const tier = account?.tier || customer?.loyalty?.account?.tier || 'bronze';
  const points = account?.pointsBalance ?? customer?.loyalty?.account?.pointsBalance ?? 0;
  const issuedDate =
    account?.cardIssuedAt || customer?.loyalty?.account?.cardIssuedAt || new Date();

  const handlePrint = () => {
    if (!printing.data?.enabled) {
      toast.error(t('printing.notConfigured'));
      return;
    }
    printCard.mutate({ cardNumber, name: customer.name });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose?.()}>
      <DialogContent className="max-w-md p-6 sm:max-w-lg">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {t('loyalty.card.title', 'Customer Loyalty Card')}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t(
                  'loyalty.card.description',
                  'Printable loyalty card label with barcode & QR code',
                )}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* The Printable Loyalty Card / Label Container */}
        <div className="flex justify-center py-2">
          <div className="w-full max-w-[340px] rounded-lg border-2 border-slate-900 bg-white p-5 text-slate-900 shadow-md print:border-black">
            {/* Store Brand & Card Title */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
              <div>
                <span className="block text-xs font-black tracking-widest uppercase text-slate-900">
                  {storeName}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {t('loyalty.card.badge', 'Rewards Club')}
                </span>
              </div>
              <Badge
                tone={LOYALTY_TIER_TONE[tier]}
                className="uppercase text-[10px] font-bold px-2 py-0.5"
              >
                <Sparkles className="size-2.5 me-1 inline" />
                {t(`customers.tiers.${tier}`, tier)}
              </Badge>
            </div>

            {/* Customer Information */}
            <div className="mb-3 space-y-0.5">
              <h3 className="text-base font-bold text-slate-900 leading-tight">{customer.name}</h3>
              {customer.phone && (
                <p className="text-xs font-medium text-slate-600" dir="ltr">
                  {customer.phone}
                </p>
              )}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                <span>
                  {t('loyalty.card.issued', 'Issued')}: {fmt.date(issuedDate)}
                </span>
                <span className="font-semibold text-slate-700">
                  {points} {t('loyalty.points', 'Points')}
                </span>
              </div>
            </div>

            {/* Barcode & QR Code Section */}
            <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5 flex flex-col items-center gap-2">
              {/* QR Code */}
              <div className="bg-white p-1 rounded-md border border-slate-200 shadow-2xs">
                <QrCode value={cardNumber} size={88} margin={1} title={cardNumber} />
              </div>

              {/* Barcode */}
              <div className="w-full flex flex-col items-center overflow-hidden">
                <Barcode value={cardNumber} height={42} moduleWidth={2} showText={false} />
                <span className="mt-1 font-mono text-xs font-bold tracking-widest text-slate-900">
                  {cardNumber}
                </span>
              </div>
            </div>

            {/* Instruction Footer */}
            <p className="mt-2 text-center text-[10px] font-medium text-slate-400">
              {t(
                'loyalty.card.footerNotice',
                'Scan barcode or QR at checkout to earn reward points',
              )}
            </p>
          </div>
        </div>

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            disabled={printCard.isPending}
            className="gap-1.5 font-semibold shadow-2xs"
          >
            <Printer className="size-4" />
            <span>{t('loyalty.card.printLabel', 'Print Label')}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
