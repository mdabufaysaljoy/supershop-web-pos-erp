'use client';

import { QtyInput } from '@supershop/ui';
import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { useCart } from './CartProvider';

/**
 * Quantity + "Add to cart" for the selected variant. The server caps the quantity to what can
 * be sold and the mini-cart opens with the result; problems are announced here.
 */
export function AddToCart({ variant, productName }) {
  const t = useT();
  const { add, busy } = useCart();
  const [qty, setQty] = useState('1');
  const [message, setMessage] = useState(null);
  const soldOut = variant?.inStock === false;
  const disabled = !variant || soldOut || busy;

  const submit = async () => {
    setMessage(null);
    const n = Math.max(1, Number.parseInt(qty, 10) || 1);
    const res = await add(variant.id, n);
    if (!res.ok) {
      const code = res.error.code;
      setMessage(
        t(
          ['OUT_OF_STOCK', 'NOT_FOUND', 'NETWORK_ERROR'].includes(code)
            ? `cart.errors.${code}`
            : 'cart.errors.generic',
        ),
      );
    } else setQty('1');
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <QtyInput
          stepper
          min={1}
          max={99}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-label={t('cart.quantityFor', { name: productName })}
          decrementLabel={t('cart.decrease', { name: productName })}
          incrementLabel={t('cart.increase', { name: productName })}
          disabled={!variant || soldOut}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="h-11 flex-1 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:flex-none"
        >
          {soldOut ? t('catalog.outOfStock') : !variant ? t('cart.chooseOptions') : t('cart.add')}
        </button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
    </div>
  );
}
