import { PERMISSIONS as P } from '@supershop/shared';
import { IntegerInput, MoneyInput } from '@supershop/ui';
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
    <IntegerInput
      value={typed ?? String(value)}
      min={1}
      aria-label={label}
      className="w-20"
      onChange={(e) => {
        setTyped(e.target.value);
        // An empty field is someone mid-edit, not "remove this line" — the × does that.
        if (e.target.value !== '') onChange(Number(e.target.value));
      }}
      onBlur={() => setTyped(null)}
    />
  );
}

/**
 * The basket. Quantities and discounts are edited in place — the cashier is standing up, with a
 * queue — and the line's money is whatever the server last said it was.
 */
export function SaleLines({ sale, priced, onQty, onDiscount, onOrderDiscount }) {
  const { t } = useTranslation();
  const can = useCan();
  const mayDiscount = can(P.POS_DISCOUNT);
  const line = (variantId) => priced?.items?.find((i) => i.variantId === variantId);

  if (!sale.lines.length)
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {t('pos.lines.empty')}
      </p>
    );

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {sale.lines.map((item) => (
          <li
            key={item.variantId}
            className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_auto]"
          >
            <div className="grid gap-0.5">
              <span className="font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground">
                {item.sku} · {fmt.money(item.price)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <QtyField
                value={item.qty}
                label={t('pos.lines.qty', { name: item.name })}
                onChange={(qty) => onQty(item.variantId, qty)}
              />
              {mayDiscount && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('pos.lines.discount')}</span>
                  <MoneyInput
                    value={item.discount?.type === 'amount' ? item.discount.value / 100 : ''}
                    aria-label={t('pos.lines.discountFor', { name: item.name })}
                    className="w-24"
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
              <span className="w-24 text-end font-medium tabular-nums">
                {fmt.money(line(item.variantId)?.lineTotal ?? item.price * item.qty)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={t('pos.lines.remove', { name: item.name })}
                onClick={() => onQty(item.variantId, 0)}
              >
                ×
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {mayDiscount && (
        <label className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{t('pos.lines.orderDiscount')}</span>
          <MoneyInput
            value={sale.orderDiscount?.type === 'amount' ? sale.orderDiscount.value / 100 : ''}
            aria-label={t('pos.lines.orderDiscount')}
            className="w-28"
            onChange={(e) =>
              onOrderDiscount(
                halalas(e.target.value) && { type: 'amount', value: halalas(e.target.value) },
              )
            }
          />
        </label>
      )}
    </div>
  );
}
