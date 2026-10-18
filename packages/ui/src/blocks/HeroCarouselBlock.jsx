'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '../lib/cn.js';
import { hrefIn } from './context.js';

/**
 * Flagship Hero Carousel:
 * Cutting-edge luminous visual design with ambient glow, bold typography,
 * trust markers, responsive controls, and high-conversion CTAs.
 */
export function HeroCarouselBlock({ slides = [], autoplaySeconds = 0, context = {} }) {
  const shown = slides.filter((slide) => slide.mediaId || slide.heading);
  const count = shown.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = useCallback((next) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || !autoplaySeconds || paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), autoplaySeconds * 1000);
    return () => clearInterval(timer);
  }, [autoplaySeconds, count, paused]);

  if (!count) return null;
  const labels = context.labels ?? {};
  const active = Math.min(index, count - 1);

  const isRtl = context.lang === 'ar';

  return (
    <section
      aria-roledescription="carousel"
      className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-950 via-indigo-950/90 to-slate-900 text-white shadow-2xl border border-white/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Ambient background glows */}
      <div className="absolute -top-24 -end-24 size-96 rounded-full bg-primary/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -start-24 size-96 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

      {/* Smooth horizontal sliding track with 500ms easing */}
      <div
        className="flex w-full transition-transform duration-500 ease-in-out"
        style={{
          transform: isRtl ? `translateX(${active * 100}%)` : `translateX(-${active * 100}%)`,
        }}
      >
        {shown.map((slide, i) => {
          const image = context.media?.[slide.mediaId];
          return (
            <div
              key={slide.mediaId ?? i}
              aria-hidden={i === active ? undefined : true}
              className="relative w-full min-w-full shrink-0 grid min-h-[360px] sm:min-h-[460px] lg:min-h-[500px] items-center p-6 sm:p-12 lg:p-16 overflow-hidden"
            >
              {image ? (
                <img
                  src={image.url}
                  srcSet={image.srcSet ?? undefined}
                  sizes="100vw"
                  alt={slide.heading || image.alt || ''}
                  width={image.width}
                  height={image.height}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : undefined}
                  className="absolute inset-0 size-full object-cover opacity-25 mix-blend-overlay"
                />
              ) : null}

              <div className="relative grid max-w-2xl gap-4 sm:gap-6">
                {/* Modern category & urgency pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1 text-xs font-semibold text-primary-foreground backdrop-blur-md w-fit">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Mega Supershop Collection · Saudi Arabia</span>
                </div>

                {slide.heading ? (
                  <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.12]">
                    {slide.heading}
                  </h2>
                ) : null}

                {slide.text ? (
                  <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                    {slide.text}
                  </p>
                ) : null}

                {slide.buttonLabel ? (
                  <div className="flex flex-wrap items-center gap-4 pt-1 sm:pt-2">
                    <a
                      href={hrefIn(slide.href, context)}
                      tabIndex={i === active ? undefined : -1}
                      className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-primary px-8 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 hover:bg-primary/90 transition-all duration-300"
                    >
                      <span>{slide.buttonLabel}</span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-4 rtl:-scale-x-100 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                ) : null}

                {/* Trust highlights */}
                <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span> 100% Genuine
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span> 2-Year KSA Warranty
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span> Tabby & Tamara Pay in 4
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label={labels.previous ?? 'Previous slide'}
            onClick={() => go(active - 1)}
            className="absolute start-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 text-xl transition-all rtl:rotate-180"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={labels.next ?? 'Next slide'}
            onClick={() => go(active + 1)}
            className="absolute end-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 text-xl transition-all rtl:rotate-180"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {shown.map((slide, i) => (
              <button
                key={slide.mediaId ?? i}
                type="button"
                aria-label={`${labels.slide ?? 'Slide'} ${i + 1}`}
                aria-current={i === active || undefined}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-2.5 transition-all duration-300 rounded-full',
                  i === active ? 'w-8 bg-primary' : 'w-2.5 bg-white/40 hover:bg-white/70',
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
