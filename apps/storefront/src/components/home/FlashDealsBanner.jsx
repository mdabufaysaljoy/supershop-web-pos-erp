'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/i18n/I18nProvider';
import { localizePath } from '@/i18n/config';

/**
 * Calculates remaining time until next Sunday midnight (weekly deal cycle)
 */
function getTargetTime() {
  const now = new Date();
  const target = new Date(now);
  const day = now.getDay(); // 0 is Sunday
  const daysUntilSunday = (7 - day) % 7 || 7;
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(23, 59, 59, 999);
  return target.getTime();
}

/**
 * High-energy Flash Deals Showcase with active ticking countdown pill & promotional incentives
 */
export function FlashDealsBanner({ lang, t: propT }) {
  const hookT = useT();
  const t = propT || hookT;
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 8,
    minutes: 42,
    seconds: 15,
  });

  useEffect(() => {
    const target = getTargetTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, target - now);

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 p-6 sm:p-10 shadow-sm">
      <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-0.5 text-xs font-bold text-white shadow-xs animate-pulse-subtle">
              <span aria-hidden="true">🔥</span>
              <span>Limited-Time Deals</span>
            </span>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Up to 50% Off
            </span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Super Deals of the Week
          </h2>

          <p className="max-w-xl text-sm text-muted-foreground">
            Exclusive promotional prices on best-selling electronics, audio gear, and fashion
            essentials. Stocks refresh weekly.
          </p>
        </div>

        {/* Action Link & Active Ticking Countdown Badge */}
        <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
          <div className="flex items-center gap-2 rounded-md border border-border/80 bg-background/80 px-4 py-2 text-xs font-semibold shadow-xs backdrop-blur-md">
            <span className="text-muted-foreground">Ends In:</span>
            <div className="flex items-center gap-1 font-mono text-sm font-bold text-foreground tabular-nums">
              {timeLeft.days > 0 && (
                <>
                  <span className="rounded bg-muted px-1.5 py-0.5">{pad(timeLeft.days)}d</span>:
                </>
              )}
              <span className="rounded bg-muted px-1.5 py-0.5">{pad(timeLeft.hours)}</span>:
              <span className="rounded bg-muted px-1.5 py-0.5">{pad(timeLeft.minutes)}</span>:
              <span className="rounded bg-muted px-1.5 py-0.5">{pad(timeLeft.seconds)}</span>
            </div>
          </div>

          <Link
            href={`${localizePath('/search', lang)}?sort=price_asc`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-foreground px-6 text-xs font-semibold text-background shadow-md transition-all hover:opacity-90 hover:scale-[1.02]"
          >
            <span>{t ? t('home.shopAll') : 'Shop Super Deals'}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
