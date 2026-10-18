'use client';

import Link from 'next/link';
import { useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';

const CONSENT_DISMISSED_KEY = 'pdpl_consent_dismissed';

/**
 * Compact center-aligned PDPL compliant cookie and privacy consent banner.
 * Formatted strictly for 2-3 lines max with details linked to privacy policy.
 * Hides immediately on ANY user action (Accept All, Necessary Only / Reject, Close ✕).
 * Persists decision in localStorage and cookie, never reappearing after dismissal.
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

  const dismiss = (choice) => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(CONSENT_DISMISSED_KEY, 'true');
      } catch {
        // ignore
      }
    }
    if (choice !== undefined && onSave) {
      try {
        onSave(choice);
      } catch {
        // ignore
      }
    }
    if (onClose) {
      try {
        onClose();
      } catch {
        // ignore
      }
    }
  };

  const handleAcceptAll = () => dismiss({ analytics: true, marketing: true });
  const handleNecessaryOnly = () => dismiss({ analytics: false, marketing: false });
  const handleSavePreferences = () => dismiss({ analytics, marketing });
  const handleClose = () => dismiss({ analytics: false, marketing: false });

  const privacyUrl = config.privacyPolicyUrl || '/privacy';

  return (
    <div
      role="region"
      aria-label={t('consent.title')}
      className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] sm:w-auto sm:max-w-xl transition-all duration-300"
    >
      <div className="relative rounded-2xl border border-border/80 bg-background/95 p-4 sm:p-5 shadow-2xl backdrop-blur-xl ring-1 ring-black/10 dark:ring-white/10">
        {/* Quick dismiss ✕ icon button */}
        <button
          type="button"
          onClick={handleClose}
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
          <div className="space-y-2.5 pe-6">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">
                🍪
              </span>
              <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                {t('consent.title')}
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
              {t('consent.description')}{' '}
              <Link
                href={localizePath(privacyUrl, lang)}
                className="underline underline-offset-2 hover:text-foreground font-semibold text-foreground/90 transition-colors"
              >
                {t('consent.privacyPolicy')}
              </Link>
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAcceptAll}
                className="h-8 sm:h-9 px-4 sm:px-5 rounded-full bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 shadow-xs shadow-primary/25 transition-all cursor-pointer active:scale-95"
              >
                {t('consent.acceptAll')}
              </button>
              <button
                type="button"
                onClick={handleNecessaryOnly}
                className="h-8 sm:h-9 px-3.5 sm:px-4 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground text-xs sm:text-sm font-medium transition-colors cursor-pointer active:scale-95"
              >
                {t('consent.necessaryOnly')}
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="h-8 sm:h-9 px-3 rounded-full text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {t('consent.customize')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="border-b border-border/60 pb-2 pe-6">
              <h2 className="text-sm sm:text-base font-bold text-foreground">
                {t('consent.customize')}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('consent.description')}</p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {/* Strictly Necessary */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/40 p-2.5">
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                      {t('consent.categories.necessary.title')}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-bold text-muted-foreground uppercase">
                      Required
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {t('consent.categories.necessary.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={t('consent.categories.necessary.title')}
                  className="mt-0.5 h-4 w-4 rounded accent-primary opacity-60 cursor-not-allowed"
                />
              </div>

              {/* Analytics */}
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="space-y-0.5 flex-1">
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    {t('consent.categories.analytics.title')}
                  </span>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {t('consent.categories.analytics.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  aria-label={t('consent.categories.analytics.title')}
                  className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </label>

              {/* Marketing */}
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="space-y-0.5 flex-1">
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    {t('consent.categories.marketing.title')}
                  </span>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {t('consent.categories.marketing.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  aria-label={t('consent.categories.marketing.title')}
                  className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={handleSavePreferences}
                className="h-8 px-4 rounded-full bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors cursor-pointer active:scale-95"
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
