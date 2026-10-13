'use client';

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
    <ul className="grid gap-3">
      {cart.items.map((l) => {
        const ok = l.status === 'ok';
        const name = l.name || l.sku;
        const href = l.slug ? localizePath(productPath(l.slug), lang) : null;
        return (
          <li
            key={l.variantId}
            className={cn(
              'grid grid-cols-[auto_1fr] gap-3 rounded-xl border p-3',
              !ok && 'bg-muted/40',
            )}
          >
            <div className={cn('overflow-hidden rounded-lg bg-muted', big ? 'size-24' : 'size-20')}>
              <MediaImage
                image={l.image}
                alt={name}
                sizes="96px"
                className="size-full object-cover"
              />
            </div>
            <div className="grid min-w-0 gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {href ? (
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 text-sm font-medium">{name}</p>
                  )}
                  {l.options.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {l.options.map((o) => `${o.name}: ${o.value}`).join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(l.variantId)}
                  aria-label={t('cart.removeItem', { name })}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
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
                <p key={n.code} role="status" className="text-xs text-amber-700">
                  {noticeText(n, t, fmt)}
                </p>
              ))}

              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                {l.status !== 'unavailable' ? (
                  <div className="inline-flex items-center rounded-full border" dir="ltr">
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full text-lg hover:bg-muted disabled:opacity-40"
                      disabled={busy || l.qty <= 1}
                      onClick={() => setQty(l.variantId, l.qty - 1)}
                      aria-label={t('cart.decrease', { name })}
                    >
                      −
                    </button>
                    <span
                      className="min-w-8 text-center text-sm tabular-nums"
                      aria-label={t('cart.quantity')}
                    >
                      {fmt.number(l.qty)}
                    </span>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full text-lg hover:bg-muted disabled:opacity-40"
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
                    <p className="text-sm font-semibold tabular-nums">{fmt.money(l.lineTotal)}</p>
                  )}
                  {ok && l.qty > 1 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t('cart.each', { price: fmt.money(l.unitPrice) })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
