'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { useCart } from './CartProvider';

/** Totals: subtotal, VAT (included or added), total, and the way to checkout. */
export function CartSummary() {
  const t = useT();
  const lang = useLang();
  const { cart, fmt, setOpen } = useCart();
  const { totals, pricesIncludeVat, vatRateBps } = cart;
  const rate = fmt.percent(vatRateBps / 10_000);
  const blocked = cart.items.some((l) => l.status !== 'ok');
  return (
    <div className="grid gap-3.5">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h2 className="text-base font-bold tracking-tight text-foreground">{t('cart.summary')}</h2>
        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          ZATCA 15% VAT
        </span>
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {fmt.money(totals.subtotal)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">
            {t(pricesIncludeVat ? 'cart.vatIncluded' : 'cart.vatAdded', { rate })}
          </dt>
          <dd className="font-medium tabular-nums text-muted-foreground">
            {fmt.money(totals.vat)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{t('checkout.delivery')}</dt>
          <dd className="tabular-nums">
            {totals.subtotal >= 20000 ? (
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {t('checkout.freeDelivery')}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t('cart.shippingAtCheckout')}</span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border/80 pt-3">
          <dt className="text-base font-bold text-foreground">{t('cart.total')}</dt>
          <dd className="text-xl font-extrabold tabular-nums text-foreground">
            {fmt.money(totals.total)}
          </dd>
        </div>
      </dl>

      <div className="mt-1 flex gap-2">
        <input
          type="text"
          placeholder={t('cart.promoPlaceholder')}
          className="h-10 flex-1 rounded-lg border border-border/80 bg-background/80 px-3 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          className="h-10 rounded-lg border border-border/80 bg-muted/70 px-3.5 text-xs font-semibold text-foreground hover:bg-muted active:scale-[0.98] transition-all"
        >
          {t('cart.apply')}
        </button>
      </div>

      {blocked && (
        <p className="text-xs font-medium text-destructive">{t('cart.removeUnavailable')}</p>
      )}

      <Link
        href={localizePath('/checkout', lang)}
        aria-disabled={blocked || undefined}
        onClick={(e) => {
          if (blocked) e.preventDefault();
          else setOpen(false); // leaving for checkout closes the mini-cart behind it
        }}
        className="group mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-sm font-bold text-white shadow-xs transition-all aria-disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-white/90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>{t('cart.checkout')}</span>
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>

      <div className="mt-3 space-y-2 border-t border-border/60 pt-3.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          </svg>
          <span>{t('cart.secureCheckout')}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect width="16" height="13" x="1" y="6" rx="2" />
            <path d="M16 10h4l3 3v6h-7M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          </svg>
          <span>{t('cart.fastDispatch')}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5" />
          </svg>
          <span>{t('cart.easyReturns')}</span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1.5 border-t border-border/40 pt-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span className="rounded border border-border/70 bg-muted/40 px-2 py-0.5">mada</span>
        <span className="rounded border border-border/70 bg-muted/40 px-2 py-0.5">Apple Pay</span>
        <span className="rounded border border-border/70 bg-muted/40 px-2 py-0.5">Visa</span>
        <span className="rounded border border-border/70 bg-muted/40 px-2 py-0.5">Mastercard</span>
      </div>
    </div>
  );
}
