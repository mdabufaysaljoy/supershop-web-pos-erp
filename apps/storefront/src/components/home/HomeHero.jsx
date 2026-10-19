'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/i18n/I18nProvider';
import { localizePath } from '@/i18n/config';

/**
 * Flagship Multi-Slide Interactive Hero Showcase:
 * - Ambient gradient mesh with glowing orbs
 * - Auto-sliding carousel with pause on hover
 * - Multi-category showcases (Electronics, Fashion, Super Deals)
 * - Navigation controls (next/prev and dot indicators)
 * - Verified Saudi supershop trust markers
 */
export function HomeHero({ lang, storeName, t: propT }) {
  const hookT = useT();
  const t = propT || hookT;
  const slides = [
    {
      id: 'tech',
      badge: 'Kingdom-Wide Express Delivery · 100% Genuine',
      title: t
        ? t('home.title', { store: storeName })
        : `${storeName} — Electronics & Smart Living`,
      subtitle: t
        ? t('site.tagline')
        : 'Flagship smartphones, pro audio, gaming laptops, and ultra 4K tech gear.',
      ctaPrimary: {
        label: t ? t('home.shopAll') : 'Shop Electronics',
        href: `${localizePath('/search', lang)}?q=electronics`,
      },
      ctaSecondary: {
        label: t ? t('home.newArrivals') : 'New Arrivals',
        href: `${localizePath('/search', lang)}?sort=newest`,
      },
      card: {
        badge: 'Featured Daily Spotlight',
        discount: 'Save 35%',
        icon: '🎧',
        category: 'Audio & Smart Living',
        name: 'Pro Wireless ANC Headphones',
        desc: 'Spatial Audio · 40h Battery · Ultra-Fast Charging',
        originalPrice: 'SAR 499',
        price: 'SAR 324',
        href: `${localizePath('/search', lang)}?q=headphones`,
        buttonLabel: 'Explore Audio Gear',
      },
    },
    {
      id: 'fashion',
      badge: 'New Season Drop · Saudi Express Shipping',
      title: 'Modern Fashion, Streetwear & Everyday Comfort',
      subtitle: 'Premium collections, oversized hoodies, luxury watches, and designer sneakers.',
      ctaPrimary: {
        label: 'Shop Fashion',
        href: `${localizePath('/search', lang)}?q=fashion`,
      },
      ctaSecondary: {
        label: 'View Collections',
        href: `${localizePath('/search', lang)}?sort=best_selling`,
      },
      card: {
        badge: 'Style Pick of the Week',
        discount: 'Save 40%',
        icon: '👕',
        category: 'Apparel & Streetwear',
        name: 'Heavyweight Cotton Streetwear Hoodie',
        desc: 'Breathable · Pre-Shrunk · Custom Arabic Typography',
        originalPrice: 'SAR 280',
        price: 'SAR 168',
        href: `${localizePath('/search', lang)}?q=hoodie`,
        buttonLabel: 'Shop Apparel',
      },
    },
    {
      id: 'deals',
      badge: 'Mega Super Deals · Limited Quantity',
      title: 'Super Deals of the Week — Up to 50% Off',
      subtitle:
        'Exclusive weekly markdowns across high-demand gadgets, accessories, and home living.',
      ctaPrimary: {
        label: 'Grab Super Deals',
        href: `${localizePath('/search', lang)}?sort=price_asc`,
      },
      ctaSecondary: {
        label: 'All Offers',
        href: `${localizePath('/search', lang)}?sort=price_asc`,
      },
      card: {
        badge: 'Limited Flash Deal',
        discount: 'Save 50%',
        icon: '⚡',
        category: 'Power & Accessories',
        name: '65W Multi-Port GaN Fast Charger',
        desc: 'PD 3.0 · Dual USB-C + USB-A · Laptop Compatible',
        originalPrice: 'SAR 199',
        price: 'SAR 99',
        href: `${localizePath('/search', lang)}?q=charger`,
        buttonLabel: 'Claim Deal',
      },
    },
  ];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const go = useCallback((next) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [count, paused]);

  const isRtl = lang === 'ar';

  return (
    <section
      aria-label="Featured Hero Slider"
      className="relative overflow-hidden rounded-xl border border-indigo-900/40 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-6 py-12 text-white shadow-2xl sm:px-12 sm:py-20 select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Decorative ambient glowing orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-blue-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -start-16 size-80 rounded-full bg-indigo-500/25 blur-3xl"
      />

      {/* Smooth sliding track with 500ms easing */}
      <div
        className="flex w-full transition-transform duration-500 ease-in-out"
        style={{
          transform: isRtl ? `translateX(${index * 100}%)` : `translateX(-${index * 100}%)`,
        }}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            aria-hidden={i === index ? undefined : true}
            className="relative z-10 w-full min-w-full shrink-0 grid items-center gap-10 lg:grid-cols-12"
          >
            {/* Left Column: Headline, Tagline, CTAs & Social Proof */}
            <div className="grid gap-6 lg:col-span-7">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md">
                <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
                <span>{s.badge}</span>
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-balance leading-tight">
                {s.title}
              </h1>

              <p className="max-w-xl text-base text-slate-300 sm:text-lg text-balance leading-relaxed">
                {s.subtitle}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={s.ctaPrimary.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>{s.ctaPrimary.label}</span>
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
                  href={s.ctaSecondary.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30"
                >
                  <span>{s.ctaSecondary.label}</span>
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
              <div className="relative rounded-lg border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="flex size-3 rounded-full bg-rose-500 animate-pulse-subtle" />
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                      {s.card.badge}
                    </span>
                  </div>
                  <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                    {s.card.discount}
                  </span>
                </div>

                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex size-28 items-center justify-center rounded-md bg-gradient-to-tr from-indigo-500/20 to-blue-500/20 text-5xl shadow-inner">
                    {s.card.icon}
                  </div>
                  <p className="text-xs font-semibold text-indigo-300 uppercase tracking-widest">
                    {s.card.category}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-white">{s.card.name}</h3>
                  <p className="mt-1 text-xs text-slate-300">{s.card.desc}</p>

                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 backdrop-blur-md">
                    <span className="text-xs text-slate-400 line-through">
                      {s.card.originalPrice}
                    </span>
                    <span className="text-base font-extrabold text-amber-300">{s.card.price}</span>
                    <span className="text-[10px] text-slate-300">incl. VAT</span>
                  </div>
                </div>

                <Link
                  href={s.card.href}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-blue-500 to-indigo-600 font-semibold text-white shadow-md transition-all hover:opacity-95"
                >
                  <span>{s.card.buttonLabel}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Slider Controls: Next/Prev Arrows & Dots */}
      <div className="relative z-20 mt-8 flex items-center justify-between border-t border-white/10 pt-4">
        <div className="flex gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-8 bg-primary' : 'w-2.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            className="grid size-9 place-items-center rounded-md border border-white/20 bg-white/5 hover:bg-white/20 text-white backdrop-blur-md transition-all rtl:rotate-180"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            className="grid size-9 place-items-center rounded-md border border-white/20 bg-white/5 hover:bg-white/20 text-white backdrop-blur-md transition-all rtl:rotate-180"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
