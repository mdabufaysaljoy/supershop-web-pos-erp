'use client';

import { useEffect, useState } from 'react';
import { hrefIn, number } from './context.js';

/**
 * Counts down to the end of an offer. The remaining time is computed on the client only —
 * a server-rendered value would be wrong by the time it arrives (and would mismatch on hydration).
 * Unit labels come from `context.labels` (this package holds no translations).
 */
const parts = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [
    ['days', Math.floor(total / 86400)],
    ['hours', Math.floor((total % 86400) / 3600)],
    ['minutes', Math.floor((total % 3600) / 60)],
    ['seconds', total % 60],
  ];
};

export function CountdownBlock({ heading, endsAt, buttonLabel, href, context = {} }) {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (Number.isNaN(end)) return undefined;
    const tick = () => setLeft(end - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [end]);

  const labels = context.labels ?? {};
  const over = left !== null && left <= 0;

  return (
    <section className="relative overflow-hidden grid justify-items-center gap-6 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 p-8 sm:p-12 text-foreground shadow-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-0.5 text-xs font-bold text-white shadow-xs">
          <span aria-hidden="true">🔥</span>
          <span>Limited-Time Offer</span>
        </span>
        {heading ? (
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl text-balance">
            {heading}
          </h2>
        ) : null}
      </div>

      {left !== null && !over ? (
        <ul
          className="flex flex-wrap justify-center gap-3 sm:gap-5 tabular-nums"
          suppressHydrationWarning
        >
          {parts(left).map(([unit, value]) => (
            <li
              key={unit}
              className="flex min-w-[72px] sm:min-w-[84px] flex-col items-center justify-center rounded-2xl border border-border/80 bg-background/90 p-3 sm:p-4 shadow-sm backdrop-blur-md"
            >
              <span className="font-mono text-2xl sm:text-4xl font-extrabold text-foreground">
                {number(value, context)}
              </span>
              <span className="mt-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {labels[unit] ?? unit}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {buttonLabel && !over ? (
        <a
          href={hrefIn(href, context)}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-sm font-bold text-background shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <span>{buttonLabel}</span>
          <span aria-hidden="true">→</span>
        </a>
      ) : null}
    </section>
  );
}
