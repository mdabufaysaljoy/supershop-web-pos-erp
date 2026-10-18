import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * High-energy Flash Deals Showcase with countdown pill & promotional incentives
 */
export function FlashDealsBanner({ lang, t }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 p-6 sm:p-10 shadow-sm">
      <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-0.5 text-xs font-bold text-white shadow-xs animate-pulse-subtle">
              <span aria-hidden="true">🔥</span>
              <span>Limited-Time Deals</span>
            </span>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Up to 45% Off
            </span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Super Deals of the Week
          </h2>

          <p className="max-w-xl text-sm text-muted-foreground">
            Special pricing on premium gadgets, audio gear, and fashion essentials. Stocks refresh
            weekly.
          </p>
        </div>

        {/* Action Link & Countdown Badge */}
        <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
          <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-background/80 px-4 py-2 text-xs font-semibold shadow-xs backdrop-blur-md">
            <span className="text-muted-foreground">Ends In:</span>
            <div className="flex items-center gap-1 font-mono text-sm font-bold text-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">08</span>:
              <span className="rounded bg-muted px-1.5 py-0.5">42</span>:
              <span className="rounded bg-muted px-1.5 py-0.5">15</span>
            </div>
          </div>

          <Link
            href={`${localizePath('/search', lang)}?sort=price_asc`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-xs font-semibold text-background shadow-md transition-all hover:opacity-90 hover:scale-[1.02]"
          >
            <span>{t('home.shopAll')}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
