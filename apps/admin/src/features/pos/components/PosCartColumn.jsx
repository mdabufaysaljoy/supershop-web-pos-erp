import { PERMISSIONS as P } from '@supershop/shared';
import { MoneyInput } from '@supershop/ui';
import { ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';

const halalas = (value) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/**
 * POS Column 3: Dedicated Product Cart Column
 * Displays basket lines with stepper quantities, line discounts, subtotal, and cart discounts.
 */
export function PosCartColumn({ sale, subtotal, onOrderDiscount, children }) {
  const { t } = useTranslation();
  const can = useCan();
  const mayDiscount = can(P.POS_DISCOUNT);
  const [discountType, setDiscountType] = useState('amount');

  const lineCount = sale?.lines?.length ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border border-slate-200/90 bg-white p-4 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-primary">
            <ShoppingCart className="size-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {t('pos.cart.title', 'Cart')}
          </h2>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
          {lineCount} line{lineCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cart Lines Scrollable Area */}
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>

      {/* Cart Financial Breakdown (Subtotal & Whole Basket Discount) */}
      <div className="border-t border-slate-100 pt-3 mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>{t('pos.cart.subtotal', 'Subtotal (incl. VAT)')}</span>
          <span className="font-bold text-slate-800 tabular-nums">{fmt.money(subtotal)}</span>
        </div>

        {mayDiscount && (
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{t('pos.lines.discount', 'Discount')}</span>
            <div className="flex items-center gap-1.5">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 outline-none"
              >
                <option value="amount">Amount</option>
                <option value="percent">Percent</option>
              </select>
              <MoneyInput
                value={sale?.orderDiscount?.type === 'amount' ? sale.orderDiscount.value / 100 : ''}
                aria-label={t('pos.lines.orderDiscount', 'Off the whole basket')}
                placeholder="0.00"
                className="h-7 w-20 rounded-md border border-rose-300 focus:border-rose-500 text-rose-600 text-end text-xs font-semibold px-2 outline-none"
                onChange={(e) =>
                  onOrderDiscount(
                    halalas(e.target.value) && {
                      type: 'amount',
                      value: halalas(e.target.value),
                    },
                  )
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
