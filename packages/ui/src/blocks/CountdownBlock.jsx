'use client';

import { useEffect, useState } from 'react';

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
    <section className="grid justify-items-center gap-4 rounded-2xl bg-foreground p-8 text-background">
      {heading ? <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2> : null}
      {left !== null && !over ? (
        <ul className="flex gap-4 tabular-nums" suppressHydrationWarning>
          {parts(left).map(([unit, value]) => (
            <li key={unit} className="grid w-16 justify-items-center">
              <span className="text-3xl font-semibold">
                {context.formatNumber
                  ? context.formatNumber(value)
                  : String(value).padStart(2, '0')}
              </span>
              <span className="text-xs uppercase opacity-70">{labels[unit] ?? unit}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {buttonLabel && !over ? (
        <a
          href={context.localizeHref?.(href) ?? href}
          className="inline-flex h-11 items-center rounded-full bg-background px-6 text-sm font-medium text-foreground"
        >
          {buttonLabel}
        </a>
      ) : null}
    </section>
  );
}
