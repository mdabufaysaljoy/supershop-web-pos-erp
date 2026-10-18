'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { CartLines } from './CartLines';
import { useCart } from './CartProvider';
import { CartSummary } from './CartSummary';

const FREE_SHIPPING_THRESHOLD = 20000; // SAR 200 in minor units

/** Full cart page body (client: the cart is personal and loaded in the browser). */
export function CartPageView() {
  const t = useT();
  const lang = useLang();
  const { cart, count, fmt } = useCart();

  if (!cart) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
          <div className="h-80 animate-pulse rounded-2xl bg-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!cart.items.length) {
    return (
      <div className="space-y-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Link href={localizePath('/', lang)} className="hover:text-foreground transition-colors">
            {t('nav.home')}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{t('cart.title')}</span>
        </nav>

        <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-border/80 bg-card/60 p-12 text-center shadow-xs">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <svg
              viewBox="0 0 24 24"
              className="size-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M6 7h12l1 13H5L6 7Z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
          </div>
          <p className="text-xl font-bold tracking-tight text-foreground">{t('cart.empty')}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('cart.emptySubtitle')}</p>
          <Link
            href={localizePath('/search', lang)}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-bold text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-[0.99] transition-all"
          >
            <span>{t('cart.startShopping')}</span>
            <span className="rtl:rotate-180">→</span>
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = cart.totals.subtotal ?? 0;
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progressPercent = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Page Heading */}
      <div className="space-y-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Link href={localizePath('/', lang)} className="hover:text-foreground transition-colors">
            {t('nav.home')}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{t('cart.title')}</span>
        </nav>

        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              {t('cart.title')}
            </h1>
            <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {count} {count === 1 ? t('cart.itemCountOne') : t('cart.itemCountOther')}
            </span>
          </div>
          <Link
            href={localizePath('/search', lang)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4"
          >
            <span className="rtl:rotate-180">←</span> {t('cart.continueShopping')}
          </Link>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
        {/* Left column: Free shipping bar + Cart lines */}
        <div className="space-y-5">
          {/* Free Shipping Incentive Banner */}
          <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-emerald-950 dark:text-emerald-200">
              <span className="text-base">🚚</span>
              {isFreeShipping ? (
                <span>{t('cart.freeShippingUnlocked')}</span>
              ) : (
                <span>{t('cart.freeShippingRemaining', { amount: fmt.money(remaining) })}</span>
              )}
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-emerald-200/60 dark:bg-emerald-900/60">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Cart items list */}
          <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-xs">
            <div className="hidden border-b border-border/60 pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[1fr_auto]">
              <span>{t('cart.title')}</span>
              <span>{t('cart.total')}</span>
            </div>
            <div className="pt-2 sm:pt-3">
              <CartLines size="lg" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Link
              href={localizePath('/search', lang)}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="rtl:rotate-180">←</span> {t('cart.continueShopping')}
            </Link>
          </div>
        </div>

        {/* Right column: Sticky Order summary */}
        <aside
          className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs lg:sticky lg:top-6"
          aria-label={t('cart.summary')}
        >
          <CartSummary />
        </aside>
      </div>
    </div>
  );
}
