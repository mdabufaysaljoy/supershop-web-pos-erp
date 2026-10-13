'use client';

import { useT } from '@/i18n/I18nProvider';
import { useCart } from './CartProvider';
import { MiniCart } from './MiniCart';

/** Header bag button with the item count; opens the mini-cart. */
export function CartButton() {
  const t = useT();
  const { count, setOpen, fmt } = useCart();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('cart.openWithCount', { count: fmt.number(count) })}
        className="relative grid size-10 place-items-center rounded-full hover:bg-muted"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 7h12l1 13H5L6 7Z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular-nums">
            {count > 99 ? '99+' : fmt.number(count)}
          </span>
        )}
      </button>
      <MiniCart />
    </>
  );
}
