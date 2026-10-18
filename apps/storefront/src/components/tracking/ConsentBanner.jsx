'use client';

import Link from 'next/link';
import { useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';

/**
 * PDPL compliant cookie and marketing consent banner.
 * Displays banner when user has not yet consented, with options:
 * - Accept All
 * - Necessary Only
 * - Customize (individual toggles for Analytics and Marketing)
 */
export function ConsentBanner({ config = {}, consent, onSave, isOpen, onClose }) {
  const t = useT();
  const lang = useLang();

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(
    () => consent?.analytics ?? Boolean(config.defaultAnalytics),
  );
  const [marketing, setMarketing] = useState(
    () => consent?.marketing ?? Boolean(config.defaultMarketing),
  );

  if (!isOpen) return null;

  const handleAcceptAll = () => {
    onSave({ analytics: true, marketing: true });
    if (onClose) onClose();
  };

  const handleNecessaryOnly = () => {
    onSave({ analytics: false, marketing: false });
    if (onClose) onClose();
  };

  const handleSavePreferences = () => {
    onSave({ analytics, marketing });
    setIsCustomizing(false);
    if (onClose) onClose();
  };

  const privacyUrl = config.privacyPolicyUrl || '/privacy';

  return (
    <div
      role="region"
      aria-label={t('consent.title')}
      className="fixed inset-x-0 bottom-0 z-50 p-4 md:p-6"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card/95 p-5 md:p-6 shadow-2xl backdrop-blur-md">
        {!isCustomizing ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5 flex-1 pe-4">
              <h2 className="text-base font-semibold text-foreground">{t('consent.title')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('consent.description')}{' '}
                <Link
                  href={localizePath(privacyUrl, lang)}
                  className="underline underline-offset-4 hover:text-foreground transition-colors"
                >
                  {t('consent.privacyPolicy')}
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-2 md:pt-0">
              <button
                type="button"
                onClick={handleAcceptAll}
                className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {t('consent.acceptAll')}
              </button>
              <button
                type="button"
                onClick={handleNecessaryOnly}
                className="h-9 px-4 rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors cursor-pointer"
              >
                {t('consent.necessaryOnly')}
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {t('consent.customize')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-b border-border pb-3">
              <h2 className="text-base font-semibold text-foreground">{t('consent.customize')}</h2>
              <p className="text-xs text-muted-foreground mt-1">{t('consent.description')}</p>
            </div>

            <div className="grid gap-3 py-1">
              {/* Strictly Necessary */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-3.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {t('consent.categories.necessary.title')}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                      Required
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('consent.categories.necessary.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={t('consent.categories.necessary.title')}
                  className="mt-1 h-4 w-4 rounded accent-primary opacity-60 cursor-not-allowed"
                />
              </div>

              {/* Analytics */}
              <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {t('consent.categories.analytics.title')}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t('consent.categories.analytics.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  aria-label={t('consent.categories.analytics.title')}
                  className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </label>

              {/* Marketing */}
              <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {t('consent.categories.marketing.title')}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t('consent.categories.marketing.description')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  aria-label={t('consent.categories.marketing.title')}
                  className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomizing(false)}
                className="h-9 px-4 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePreferences}
                className="h-9 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
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
