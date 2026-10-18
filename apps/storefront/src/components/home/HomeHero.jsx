import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * Modern flagship Hero Showcase:
 * - Ambient gradient mesh background with luminous blur orbs
 * - Verified supershop badge & value proposition pills
 * - Bold high-contrast typography with English source localization
 * - Interactive Deal Spotlight glass card
 */
export function HomeHero({ lang, storeName, t }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-900/40 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-6 py-12 text-white shadow-2xl sm:px-12 sm:py-20">
      {/* Decorative ambient glowing orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-blue-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -start-16 size-80 rounded-full bg-indigo-500/25 blur-3xl"
      />

      <div className="relative z-10 grid items-center gap-10 lg:grid-cols-12">
        {/* Left Column: Headline, Tagline, CTAs & Social Proof */}
        <div className="grid gap-6 lg:col-span-7">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md">
            <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
            <span>Kingdom-Wide Express Delivery · 100% Genuine</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-balance">
            {t('home.title', { store: storeName })}
          </h1>

          <p className="max-w-xl text-base text-slate-300 sm:text-lg text-balance">
            {t('site.tagline')}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href={localizePath('/search', lang)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{t('home.shopAll')}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 rtl:-scale-x-100"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>

            <Link
              href={`${localizePath('/search', lang)}?sort=newest`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30"
            >
              <span>{t('home.newArrivals')}</span>
              <span aria-hidden="true">✨</span>
            </Link>
          </div>

          {/* Social Proof & Trust Badges */}
          <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-6 text-xs text-slate-300">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-white">⭐ 4.9 / 5.0</span>
              <span className="text-slate-400">12,000+ Reviews</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-white">⚡ Same-Day</span>
              <span className="text-slate-400">Riyadh & Jeddah Hubs</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-white">🛡️ 2-Yr Warranty</span>
              <span className="text-slate-400">Authorized Goods</span>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Deal Spotlight Card */}
        <div className="hidden lg:col-span-5 lg:block">
          <div className="relative rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="flex size-3 rounded-full bg-rose-500 animate-pulse-subtle" />
                <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Featured Daily Spotlight
                </span>
              </div>
              <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                Save 35%
              </span>
            </div>

            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-28 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-blue-500/20 text-5xl shadow-inner">
                🎧
              </div>
              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-widest">
                Audio & Smart Living
              </p>
              <h3 className="mt-1 text-lg font-bold text-white">Pro Wireless ANC Headphones</h3>
              <p className="mt-1 text-xs text-slate-300">
                Spatial Audio · 40h Battery · Ultra-Fast Charging
              </p>

              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 backdrop-blur-md">
                <span className="text-xs text-slate-400 line-through">SAR 499</span>
                <span className="text-base font-extrabold text-amber-300">SAR 324</span>
                <span className="text-[10px] text-slate-300">incl. VAT</span>
              </div>
            </div>

            <Link
              href={localizePath('/search?q=headphones', lang)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 font-semibold text-white shadow-md transition-all hover:opacity-95"
            >
              <span>Explore Audio Gear</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
