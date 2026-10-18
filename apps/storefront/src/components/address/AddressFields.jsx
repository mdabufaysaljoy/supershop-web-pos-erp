'use client';

import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

/** An empty Saudi address; the optional National Address parts stay blank until typed. */
export const EMPTY_ADDRESS = Object.freeze({
  city: '',
  line1: '',
  district: '',
  buildingNumber: '',
  postalCode: '',
  additionalNumber: '',
  shortAddress: '',
  landmark: '',
});

/** Only the keys the API accepts (a saved address carries nothing else back into a form). */
export const toAddressForm = (address) => ({
  ...EMPTY_ADDRESS,
  ...Object.fromEntries(
    Object.keys(EMPTY_ADDRESS).map((k) => [k, address?.[k] == null ? '' : String(address[k])]),
  ),
});

/**
 * The delivery-address block, shared by checkout and the account address book so both ask for the
 * same things in the same order (CLAUDE.md §3.5). Labels live in the `checkout` namespace.
 * @param {{ value: object, onChange: (patch: object) => void, error: (path: string) => string | undefined }} props
 *   `error` is called with the plain field name ('line1'); the caller adds any prefix.
 */
export function AddressFields({ value, onChange, error }) {
  const t = useT();
  const hasNationalValues = Boolean(
    value.shortAddress || value.postalCode || value.buildingNumber || value.additionalNumber,
  );
  const [openNational, setOpenNational] = useState(hasNationalValues);

  return (
    <div className="space-y-4">
      {/* Primary street address */}
      <FormField label={t('checkout.addressLine')} error={error('line1')} required>
        <div className="relative">
          <PlainTextInput
            autoComplete="street-address"
            maxLength={200}
            placeholder={t('checkout.addressLinePlaceholder')}
            value={value.line1}
            onChange={(e) => onChange({ line1: e.target.value })}
            className="h-11 rounded-xl ps-10 border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
          />
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-base select-none">
            📍
          </span>
        </div>
      </FormField>

      {/* City & District */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('checkout.city')} error={error('city')} required>
          <div className="relative">
            <PlainTextInput
              autoComplete="address-level2"
              maxLength={60}
              value={value.city}
              onChange={(e) => onChange({ city: e.target.value })}
              className="h-11 rounded-xl ps-10 border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
            />
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-base select-none">
              🏙️
            </span>
          </div>
        </FormField>
        <FormField label={t('checkout.district')} error={error('district')}>
          <div className="relative">
            <PlainTextInput
              maxLength={80}
              value={value.district}
              onChange={(e) => onChange({ district: e.target.value })}
              className="h-11 rounded-xl ps-10 border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
            />
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-base select-none">
              🏘️
            </span>
          </div>
        </FormField>
      </div>

      {/* Saudi National Address (العنوان الوطني / SPL) */}
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 sm:p-5 transition-all shadow-xs">
        <button
          type="button"
          onClick={() => setOpenNational((o) => !o)}
          aria-expanded={openNational}
          className="flex w-full items-center justify-between gap-3 text-start transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-xl cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-base shadow-xs select-none">
              🇸🇦
            </span>
            <div>
              <p className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-emerald-950 dark:text-emerald-100 group-hover:text-emerald-800 transition-colors">
                {t('checkout.splNationalAddress')}
              </p>
              <p className="text-[11px] font-medium text-emerald-800/80 dark:text-emerald-300/80">
                {t('checkout.splSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!openNational && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 border border-emerald-600/20">
                {t('checkout.splFoldedBadge')}
              </span>
            )}
            <span
              className={`flex size-7 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-900 dark:text-emerald-200 transition-transform duration-200 ${
                openNational ? 'rotate-180 bg-emerald-600/20' : ''
              }`}
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>
        </button>

        {openNational && (
          <div className="mt-4 pt-4 border-t border-emerald-600/20 grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('checkout.shortAddress')}
              description={t('checkout.shortAddressHint')}
              error={error('shortAddress')}
            >
              <PlainTextInput
                dir="ltr"
                maxLength={8}
                placeholder="e.g. RRRD2929"
                value={value.shortAddress}
                onChange={(e) => onChange({ shortAddress: e.target.value.toUpperCase() })}
                className="h-11 rounded-xl font-mono uppercase tracking-wider border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
              />
            </FormField>

            <FormField label={t('checkout.postalCode')} error={error('postalCode')}>
              <PlainTextInput
                inputMode="numeric"
                dir="ltr"
                maxLength={5}
                autoComplete="postal-code"
                placeholder="5 digits (e.g. 12211)"
                value={value.postalCode}
                onChange={(e) => onChange({ postalCode: e.target.value })}
                className="h-11 rounded-xl font-mono border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
              />
            </FormField>

            <FormField label={t('checkout.buildingNumber')} error={error('buildingNumber')}>
              <PlainTextInput
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                placeholder="4 digits (e.g. 7234)"
                value={value.buildingNumber}
                onChange={(e) => onChange({ buildingNumber: e.target.value })}
                className="h-11 rounded-xl font-mono border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
              />
            </FormField>

            <FormField label={t('checkout.additionalNumber')} error={error('additionalNumber')}>
              <PlainTextInput
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                placeholder="4 digits (e.g. 2938)"
                value={value.additionalNumber}
                onChange={(e) => onChange({ additionalNumber: e.target.value })}
                className="h-11 rounded-xl font-mono border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Extra directions / Landmark */}
      <FormField label={t('checkout.landmark')} error={error('landmark')}>
        <div className="relative">
          <PlainTextInput
            maxLength={200}
            placeholder={t('checkout.landmarkPlaceholder')}
            value={value.landmark}
            onChange={(e) => onChange({ landmark: e.target.value })}
            className="h-11 rounded-xl ps-10 border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
          />
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-base select-none">
            🧭
          </span>
        </div>
      </FormField>
    </div>
  );
}
