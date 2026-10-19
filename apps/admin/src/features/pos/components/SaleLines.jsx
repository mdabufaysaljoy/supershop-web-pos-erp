import { PERMISSIONS as P } from '@supershop/shared';
import { IntegerInput, MoneyInput } from '@supershop/ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';

/** "5.00" → 500 halalas; anything that is not a number clears the discount. */
const halalas = (value) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/**
 * The quantity keeps its own text while it is being typed: a cashier who clears the field to put
 * in 3 means 3, not 13.
 */
function QtyField({ value, label, onChange }) {
  /** `null` = show the basket's quantity; a string = what the cashier is typing right now. */
  const [typed, setTyped] = useState(null);
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 rounded-md text-slate-600"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        -
      </Button>
      <IntegerInput
        value={typed ?? String(value)}
        min={1}
        aria-label={label}
        className="w-12 h-7 rounded-md text-center px-1 text-xs font-semibold"
        onChange={(e) => {
          setTyped(e.target.value);
          if (e.target.value !== '') onChange(Number(e.target.value));
        }}
        onBlur={() => setTyped(null)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 rounded-md text-slate-600"
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

/**
 * The basket lines: clean row per scanned product with in-place steppers, discounts, and line totals.
 */
export function SaleLines({ sale, priced, onQty, onDiscount }) {
  const { t } = useTranslation();
  const can = useCan();
  const mayDiscount = can(P.POS_DISCOUNT);
  const line = (variantId) => priced?.items?.find((i) => i.variantId === variantId);

  if (!sale.lines.length)
    return (
      <div className="py-20 text-center text-slate-400 text-sm font-medium">
        {t('pos.lines.empty', 'Nothing in the basket yet. Scan something.')}
      </div>
    );

  return (
    <ul className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto px-4 py-2">
      {sale.lines.map((item) => (
        <li key={item.variantId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-slate-900 truncate">{item.name}</span>
            <span className="text-xs text-slate-500 font-normal">
              {item.sku} · {fmt.money(item.price)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <QtyField
              value={item.qty}
              label={t('pos.lines.qty', { name: item.name })}
              onChange={(qty) => onQty(item.variantId, qty)}
            />

            {mayDiscount && (
              <label className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">{t('pos.lines.discount')}</span>
                <MoneyInput
                  value={item.discount?.type === 'amount' ? item.discount.value / 100 : ''}
                  aria-label={t('pos.lines.discountFor', { name: item.name })}
                  className="w-16 h-7 text-xs rounded-md border-slate-200"
                  onChange={(e) =>
                    onDiscount(
                      item.variantId,
                      halalas(e.target.value) && {
                        type: 'amount',
                        value: halalas(e.target.value),
                      },
                    )
                  }
                />
              </label>
            )}

            <span className="w-20 text-end text-sm font-bold text-slate-900 tabular-nums">
              {fmt.money(line(item.variantId)?.lineTotal ?? item.price * item.qty)}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-md"
              aria-label={t('pos.lines.remove', { name: item.name })}
              onClick={() => onQty(item.variantId, 0)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
