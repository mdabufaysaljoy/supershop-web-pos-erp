'use client';

import { QtyInput } from '@supershop/ui';
import { AnimatePresence, m } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { CHECKOUT_PATH } from '@/lib/checkout';
import { useCart } from './CartProvider';

const ERROR_CODES = ['OUT_OF_STOCK', 'NOT_FOUND', 'NETWORK_ERROR'];

/**
 * Quantity + "Add to cart" (+ optional "Buy now") for the selected variant. The server caps the
 * quantity to what can be sold; the mini-cart opens with the result (Buy now goes straight on).
 * The button briefly confirms with a check mark; problems are announced below it.
 */
export function AddToCart({ variant, productName, buyNow = false, onAdded, showQty = true }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { add, busy } = useCart();
  const [qty, setQty] = useState('1');
  const [message, setMessage] = useState(null);
  const [added, setAdded] = useState(false);
  const soldOut = variant?.inStock === false;
  const disabled = !variant || soldOut || busy;

  useEffect(() => {
    if (!added) return undefined;
    const timer = setTimeout(() => setAdded(false), 1600);
    return () => clearTimeout(timer);
  }, [added]);

  const submit = async (now) => {
    setMessage(null);
    const n = Math.max(1, Number.parseInt(qty, 10) || 1);
    const res = await add(variant.id, n, { open: !now });
    if (!res.ok) {
      const code = res.error.code;
      setMessage(t(ERROR_CODES.includes(code) ? `cart.errors.${code}` : 'cart.errors.generic'));
      return;
    }
    setQty('1');
    onAdded?.();
    if (now) router.push(localizePath(CHECKOUT_PATH, lang));
    else setAdded(true);
  };

  const label = soldOut
    ? t('catalog.outOfStock')
    : !variant
      ? t('cart.chooseOptions')
      : t('cart.add');
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {showQty && (
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
        )}
        <m.button
          type="button"
          onClick={() => submit(false)}
          disabled={disabled}
          whileTap={disabled ? undefined : { scale: 0.97 }}
          className="relative h-11 flex-1 overflow-hidden rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:flex-none"
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={added ? 'added' : 'add'}
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {added && (
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
              )}
              {added ? t('cart.added') : label}
            </m.span>
          </AnimatePresence>
        </m.button>
        {buyNow && (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={disabled}
            className="h-11 flex-1 rounded-full border border-primary px-6 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 sm:flex-none"
          >
            {t('cart.buyNow')}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {message}
      </p>
    </div>
  );
}
