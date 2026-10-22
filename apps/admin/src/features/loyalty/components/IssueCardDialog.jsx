import { CreditCard, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIssueLoyaltyCard } from '@/features/customers/resource';
import { useSettings } from '@/features/settings/hooks';
import { fmt } from '@/lib/format';

/**
 * Issue Loyalty Card Dialog
 * Allows store staff to issue a loyalty card with optional custom card number and fee.
 */
export function IssueCardDialog({ open, onClose, customer, onCardIssued }) {
  const { t } = useTranslation();
  const { data: customerSettings } = useSettings('customers');
  const defaultFeeHalalas =
    customerSettings?.find?.((s) => s.key === 'loyalty.cardIssuanceFee')?.value ?? 0;
  const [cardNumber, setCardNumber] = useState('');
  const issueMutation = useIssueLoyaltyCard(customer?.id);

  if (!customer) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    // The fee is the shop's setting, not a figure a counter types: the API decides it.
    const result = await issueMutation.mutateAsync({
      cardNumber: cardNumber.trim() || undefined,
    });
    if (result) {
      onCardIssued?.(result);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose?.()}>
      <DialogContent className="max-w-md p-6">
        <div className="flex items-center gap-2 border-b pb-3">
          <div className="flex size-8 items-center justify-center rounded bg-primary/10 text-primary">
            <CreditCard className="size-4" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              {t('loyalty.issue.title', 'Issue Loyalty Card')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t(
                'loyalty.issue.description',
                'Issue a new rewards membership card against this customer',
              )}
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Customer Summary Card */}
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs">
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {t('customers.name', 'Customer')}
            </span>
            <p className="text-sm font-bold text-slate-900">{customer.name}</p>
            {customer.phone && (
              <p className="text-xs text-slate-600" dir="ltr">
                {customer.phone}
              </p>
            )}
          </div>

          {/* Card Number Input */}
          <div className="space-y-1.5">
            <Label htmlFor="issue-card-number" className="text-xs font-semibold">
              {t('loyalty.issue.cardNumberLabel', 'Card Number / Barcode (Optional)')}
            </Label>
            <Input
              id="issue-card-number"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value.toUpperCase())}
              placeholder={t(
                'loyalty.issue.cardNumberPlaceholder',
                'Leave blank to auto-generate (e.g. LC10001234)',
              )}
              className="h-9 font-mono text-xs uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                'loyalty.issue.cardNumberHint',
                'Can be scanned or entered manually. Code128 and QR format supported.',
              )}
            </p>
          </div>

          {/* What the card costs — the shop's own setting (Settings → Customers). */}
          <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                {t('loyalty.issue.feeLabel', 'Card issuance fee')}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t(
                  'loyalty.issue.feeFixed',
                  'Set in Settings → Customers; the same at every till.',
                )}
              </span>
            </div>
            <output
              aria-label={t('loyalty.issue.feeLabel', 'Card issuance fee')}
              className="text-sm font-bold tabular-nums text-slate-900"
            >
              {fmt.money(defaultFeeHalalas)}
            </output>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={issueMutation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={issueMutation.isPending}
              className="gap-1.5 font-semibold shadow-2xs"
            >
              <Sparkles className="size-3.5" />
              <span>
                {issueMutation.isPending
                  ? t('common.saving', 'Issuing...')
                  : t('loyalty.issue.submit', 'Issue Card & View Label')}
              </span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
