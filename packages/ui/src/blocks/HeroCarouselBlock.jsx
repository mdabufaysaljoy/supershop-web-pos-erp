'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '../lib/cn.js';
import { hrefIn } from './context.js';

/**
 * The hero at the top of a page: one slide at a time, with dots and (optional) autoplay.
 * Direction-agnostic — the controls sit on logical sides, so RTL mirrors itself.
 * Labels come from `context` because this package is i18n-agnostic (see FormField).
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

  return (
    <section
      aria-roledescription="carousel"
      className="relative overflow-hidden rounded-2xl bg-muted"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {shown.map((slide, i) => {
        const image = context.media?.[slide.mediaId];
        return (
          <div
            key={slide.mediaId ?? i}
            aria-hidden={i === active ? undefined : true}
            className={cn(
              'grid min-h-72 items-center p-8 sm:min-h-96 sm:p-12',
              i === active ? 'relative' : 'absolute inset-0 opacity-0',
            )}
          >
            {image ? (
              <img
                src={image.url}
                srcSet={image.srcSet ?? undefined}
                sizes="100vw"
                alt=""
                width={image.width}
                height={image.height}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : undefined}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            <div className="relative grid max-w-lg gap-3 rounded-xl bg-background/80 p-6 backdrop-blur-sm">
              {slide.heading ? (
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {slide.heading}
                </h2>
              ) : null}
              {slide.text ? (
                <p className="text-base/7 text-muted-foreground">{slide.text}</p>
              ) : null}
              {slide.buttonLabel ? (
                <a
                  href={hrefIn(slide.href, context)}
                  tabIndex={i === active ? undefined : -1}
                  className="inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
                >
                  {slide.buttonLabel}
                </a>
              ) : null}
            </div>
          </div>
        );
      })}

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label={labels.previous ?? 'Previous slide'}
            onClick={() => go(active - 1)}
            className="absolute start-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-lg rtl:rotate-180"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={labels.next ?? 'Next slide'}
            onClick={() => go(active + 1)}
            className="absolute end-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-lg rtl:rotate-180"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {shown.map((slide, i) => (
              <button
                key={slide.mediaId ?? i}
                type="button"
                aria-label={`${labels.slide ?? 'Slide'} ${i + 1}`}
                aria-current={i === active || undefined}
                onClick={() => setIndex(i)}
                className={cn(
                  'size-2.5 rounded-full',
                  i === active ? 'bg-primary' : 'bg-background/70',
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
