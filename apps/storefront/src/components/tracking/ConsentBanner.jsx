'use client';

import Link from 'next/link';
import { useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';

/**
 * Compact, modern PDPL compliant cookie and privacy consent banner.
 * Designed as a non-intrusive floating card in the bottom corner.
 * Guarantees instant dismissal on accept/reject/customize.
 */
export function ConsentBanner({ config = {}, consent, onSave, isOpen, onClose }) {
  const t = useT();
  const lang = useLang();

  const [isDismissed, setIsDismissed] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(
    () => consent?.analytics ?? Boolean(config.defaultAnalytics),
  );
  const [marketing, setMarketing] = useState(
    () => consent?.marketing ?? Boolean(config.defaultMarketing),
  );

  if (!isOpen || isDismissed) return null;

  const handleAcceptAll = () => {
    setIsDismissed(true);
    try {
      if (onSave) onSave({ analytics: true, marketing: true });
    } catch {
      // ignore
    }
    if (onClose) onClose();
  };

  const handleNecessaryOnly = () => {
    setIsDismissed(true);
    try {
      if (onSave) onSave({ analytics: false, marketing: false });
    } catch {
      // ignore
    }
    if (onClose) onClose();
  };

  const handleSavePreferences = () => {
    setIsDismissed(true);
    try {
      if (onSave) onSave({ analytics, marketing });
    } catch {
      // ignore
    }
    setIsCustomizing(false);
    if (onClose) onClose();
  };

  const privacyUrl = config.privacyPolicyUrl || '/privacy';

  return (
    <div
      role="region"
      aria-label={t('consent.title')}
      className="fixed bottom-4 start-4 end-4 sm:end-auto sm:max-w-md z-50 transition-all duration-300"
    >
      <div className="relative rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Quick dismiss button */}
        <button
          type="button"
          onClick={handleNecessaryOnly}
          aria-label="Close"
          className="absolute top-3 end-3 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className="size-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!isCustomizing ? (
          <div className="space-y-3 pe-5">
            <div className="flex items-center gap-2">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base"
                aria-hidden="true"
              >
                🍪
              </span>
              <h2 className="text-sm font-bold text-foreground tracking-tight">
                {t('consent.title')}
              </h2>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {t('consent.description')}{' '}
              <Link
                href={localizePath(privacyUrl, lang)}
                className="underline underline-offset-2 hover:text-foreground font-medium text-foreground/80 transition-colors"
              >
                {t('consent.privacyPolicy')}
              </Link>
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAcceptAll}
                className="h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shadow-xs shadow-primary/25 transition-all cursor-pointer active:scale-95"
              >
                {t('consent.acceptAll')}
              </button>
              <button
                type="button"
                onClick={handleNecessaryOnly}
                className="h-8 px-3 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground text-xs font-medium transition-colors cursor-pointer active:scale-95"
              >
                {t('consent.necessaryOnly')}
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="h-8 px-2 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {t('consent.customize')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="border-b border-border/60 pb-2 pe-6">
              <h2 className="text-sm font-bold text-foreground">{t('consent.customize')}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                {t('consent.description')}
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {/* Strictly Necessary */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/40 p-2.5">
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {t('consent.categories.necessary.title')}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-bold text-muted-foreground uppercase">
                      Required
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t('consent.categories.necessary.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={t('consent.categories.necessary.title')}
                  className="mt-0.5 h-3.5 w-3.5 rounded accent-primary opacity-60 cursor-not-allowed"
                />
              </div>

              {/* Analytics */}
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="space-y-0.5 flex-1">
                  <span className="text-xs font-semibold text-foreground">
                    {t('consent.categories.analytics.title')}
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t('consent.categories.analytics.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  aria-label={t('consent.categories.analytics.title')}
                  className="mt-0.5 h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                />
              </label>

              {/* Marketing */}
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="space-y-0.5 flex-1">
                  <span className="text-xs font-semibold text-foreground">
                    {t('consent.categories.marketing.title')}
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t('consent.categories.marketing.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  aria-label={t('consent.categories.marketing.title')}
                  className="mt-0.5 h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
              <button
                type="button"
                onClick={() => setIsCustomizing(false)}
                className="h-7 px-3 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePreferences}
                className="h-7 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer active:scale-95"
              >
                {t('consent.savePreferences')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
