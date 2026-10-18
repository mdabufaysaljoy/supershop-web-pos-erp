import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * Dual Category Spotlight Promo Banners:
 * - High visual impact with gradients, icons, and direct CTA links
 */
export function PromoBanners({ lang }) {
  return (
    <section aria-label="Featured Collections" className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {/* Banner 1: Electronics & Smart Gadgets */}
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-lg transition-all duration-300 hover:shadow-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 -end-10 size-48 rounded-full bg-blue-500/20 blur-2xl"
        />

        <div className="relative z-10 grid gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300">
            <span>⚡</span>
            <span>Smart Tech Ecosystem</span>
          </span>

          <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Next-Gen Audio & Mobile Gear
          </h3>

          <p className="max-w-md text-sm text-slate-300 leading-relaxed">
            Experience spatial sound, ultra-fast GaN charging, and durable cases designed for
            everyday mobility.
          </p>
        </div>

        <div className="relative z-10 mt-6 pt-2">
          <Link
            href={localizePath('/search?q=gadgets', lang)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-xs font-bold text-slate-900 shadow-md transition-all hover:bg-slate-100 hover:scale-[1.02]"
          >
            <span>Explore Electronics</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* Banner 2: Fashion & Premium Apparel */}
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-stone-900 via-neutral-900 to-amber-950 p-8 text-white shadow-lg transition-all duration-300 hover:shadow-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 -end-10 size-48 rounded-full bg-amber-500/20 blur-2xl"
        />

        <div className="relative z-10 grid gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
            <span>✨</span>
            <span>Curated Lifestyle</span>
          </span>

          <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Modern Fashion & Accessories
          </h3>

          <p className="max-w-md text-sm text-stone-300 leading-relaxed">
            Premium everyday clothing, minimalist watches, travel backpacks, and curated eyewear
            tailored for Saudi style.
          </p>
        </div>

        <div className="relative z-10 mt-6 pt-2">
          <Link
            href={localizePath('/search?q=fashion', lang)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-xs font-bold text-stone-900 shadow-md transition-all hover:bg-stone-100 hover:scale-[1.02]"
          >
            <span>Shop Fashion Drops</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
