'use client';

import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { MediaImage } from '@/components/catalog/MediaImage';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { productPath } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { useCart } from './CartProvider';

/** Text for a line notice (shown once after the server corrected something). */
function noticeText(n, t, fmt) {
  if (n.code === 'price_changed')
    return t('cart.notices.priceChanged', { from: fmt.money(n.from), to: fmt.money(n.to) });
  if (n.code === 'qty_reduced') return t('cart.notices.qtyReduced', { qty: n.to });
  return null;
}

/**
 * Cart lines as compact cards (mini-cart and cart page): image, name + options, unit price,
 * − qty + stepper, remove, line total, and any notice (price changed, quantity reduced,
 * out of stock, no longer available).
 */
export function CartLines({ size = 'sm', onNavigate }) {
  const t = useT();
  const lang = useLang();
  const { cart, fmt, busy, setQty, remove } = useCart();
  const big = size === 'lg';

  return (
    <ul className="grid">
      <AnimatePresence initial={false}>
        {cart.items.map((l) => {
          const ok = l.status === 'ok';
          const name = l.name || l.sku;
          const href = l.slug ? localizePath(productPath(l.slug), lang) : null;
          return (
            <m.li
              key={l.variantId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  'group relative mb-3 grid grid-cols-[auto_1fr] gap-3 sm:gap-3.5 rounded-md border border-border/80 bg-card p-3 sm:p-3.5 shadow-2xs transition-all hover:border-border',
                  !ok && 'border-dashed bg-muted/40',
                )}
              >
                <div
                  className={cn(
                    'relative shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/30 shadow-2xs',
                    big ? 'size-20 sm:size-24' : 'size-18',
                  )}
                >
                  <MediaImage
                    image={l.image}
                    alt={name}
                    sizes={big ? '96px' : '72px'}
                    className="size-full object-cover"
                  />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {href ? (
                        <Link
                          href={href}
                          onClick={onNavigate}
                          className="line-clamp-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {name}
                        </Link>
                      ) : (
                        <p className="line-clamp-2 text-sm font-semibold text-foreground">{name}</p>
                      )}
                      {l.options.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {l.options.map((o) => `${o.name}: ${o.value}`).join(' · ')}
                        </p>
                      )}
                      {ok && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                          <span className="inline-block size-1.5 rounded-full bg-emerald-600" />
                          <span>{t('cart.inStock')}</span>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(l.variantId)}
                      aria-label={t('cart.removeItem', { name })}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive active:scale-95 disabled:opacity-50 transition-all"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {l.status === 'out_of_stock' && (
                    <p className="text-xs font-medium text-destructive">{t('cart.outOfStock')}</p>
                  )}
                  {l.status === 'unavailable' && (
                    <p className="text-xs font-medium text-destructive">{t('cart.unavailable')}</p>
                  )}
                  {l.notices.map((n) => (
                    <p key={n.code} role="status" className="text-xs font-medium text-amber-700">
                      {noticeText(n, t, fmt)}
                    </p>
                  ))}

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                    {l.status !== 'unavailable' ? (
                      <div
                        className="inline-flex items-center rounded-md border border-border/80 bg-background/80 shadow-2xs"
                        dir="ltr"
                      >
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-s-md text-sm font-semibold text-foreground hover:bg-muted active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                          disabled={busy || l.qty <= 1}
                          onClick={() => setQty(l.variantId, l.qty - 1)}
                          aria-label={t('cart.decrease', { name })}
                        >
                          −
                        </button>
                        <span
                          className="min-w-8 border-x border-border/60 text-center text-xs font-semibold tabular-nums text-foreground"
                          aria-label={t('cart.quantity')}
                        >
                          {fmt.number(l.qty)}
                        </span>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-e-md text-sm font-semibold text-foreground hover:bg-muted active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                          disabled={busy || !ok || l.qty >= l.maxQty}
                          onClick={() => setQty(l.variantId, l.qty + 1)}
                          aria-label={t('cart.increase', { name })}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span />
                    )}
                    <div className="text-end">
                      {ok && (
                        <p className="text-base font-bold tabular-nums text-foreground">
                          {fmt.money(l.lineTotal)}
                        </p>
                      )}
                      {ok && l.qty > 1 && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t('cart.each', { price: fmt.money(l.unitPrice) })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
