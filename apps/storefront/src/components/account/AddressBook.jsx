'use client';

import { createAccountSchemas } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useEffect, useState } from 'react';
import { AddressFields, EMPTY_ADDRESS, toAddressForm } from '@/components/address/AddressFields';
import { useT } from '@/i18n/I18nProvider';
import { ACCOUNT_BASE, detailsToErrors } from '@/lib/accountApi';
import { fieldError } from '@/lib/fieldError';
import { useAuth } from './AuthProvider';
import { SubmitButton } from './authParts';

/**
 * The saved delivery addresses. The server decides which one is the default (exactly one), so the
 * list always re-renders from its answer rather than from local guesses.
 */
const schemas = createAccountSchemas();

export function AddressBook() {
  const t = useT();
  const { authed, profile } = useAuth();
  const [addresses, setAddresses] = useState(profile?.addresses ?? []);
  const [editing, setEditing] = useState(null); // address id | 'new' | null
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authed('GET', `${ACCOUNT_BASE}/addresses`)
      .then((list) => !cancelled && setAddresses(list ?? []))
      .catch(() => !cancelled && setError(t('account.errors.generic')));
    return () => {
      cancelled = true;
    };
  }, [authed, t]);

  const act = async (id, run) => {
    setBusyId(id);
    setError(null);
    try {
      setAddresses(await run());
    } catch {
      setError(t('account.errors.generic'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive font-medium flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Header bar with title and Add button (when not editing and has addresses) */}
      {addresses.length > 0 && editing !== 'new' && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {t('account.addresses.title')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage your delivery destinations and national address profiles.
            </p>
          </div>
          <button
            type="button"
            className="h-11 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 text-sm font-semibold shadow-sm shadow-primary/25 hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
            onClick={() => setEditing('new')}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>{t('account.addresses.add')}</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {addresses.length === 0 && editing !== 'new' && (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/20 p-10 sm:p-14 text-center flex flex-col items-center justify-center gap-4">
          <div className="size-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center text-3xl shadow-xs">
            📍
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground text-base">
              {t('account.addresses.empty')}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Save your home, office, and family delivery locations for quick, 1-click checkout.
            </p>
          </div>
          <button
            type="button"
            className="mt-2 h-11 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
            onClick={() => setEditing('new')}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>{t('account.addresses.add')}</span>
          </button>
        </div>
      )}

      {/* Address Cards List */}
      {addresses.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2">
          {addresses.map((entry) => {
            const isHome = /home/i.test(entry.label || '');
            const isWork = /work|office/i.test(entry.label || '');
            const icon = isHome ? '🏠' : isWork ? '🏢' : '📍';
            return (
              <li
                key={entry.id}
                className={`rounded-2xl border transition-all duration-200 ${
                  entry.isDefault
                    ? 'border-primary/40 bg-card shadow-sm ring-1 ring-primary/20'
                    : 'border-border/70 bg-card shadow-xs hover:shadow-md hover:border-border'
                } p-5 sm:p-6`}
              >
                {editing === entry.id ? (
                  <AddressForm
                    initial={entry}
                    onCancel={() => setEditing(null)}
                    onSaved={(list) => {
                      setAddresses(list);
                      setEditing(null);
                    }}
                  />
                ) : (
                  <div className="flex flex-col justify-between h-full gap-5">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-9 items-center justify-center rounded-xl bg-muted/80 text-base shadow-xs select-none">
                            {icon}
                          </span>
                          <h3 className="font-bold text-foreground text-base tracking-tight">
                            {entry.label || t('account.addresses.untitled')}
                          </h3>
                        </div>
                        {entry.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <span>⭐</span>
                            <span>{t('account.addresses.default')}</span>
                          </span>
                        )}
                      </div>

                      <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
                        <AddressSummary address={entry.address} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-xs">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-medium hover:bg-muted transition-colors text-foreground"
                        onClick={() => setEditing(entry.id)}
                      >
                        <svg
                          className="size-3.5 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                        <span>{t('account.addresses.edit')}</span>
                      </button>
                      {!entry.isDefault && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-medium hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          disabled={busyId === entry.id}
                          onClick={() =>
                            act(entry.id, () =>
                              authed('PATCH', `${ACCOUNT_BASE}/addresses/${entry.id}`, {
                                isDefault: true,
                              }),
                            )
                          }
                        >
                          <svg
                            className="size-3.5 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span>{t('account.addresses.makeDefault')}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 px-3 py-1.5 font-medium text-destructive hover:bg-destructive/10 transition-colors ms-auto"
                        disabled={busyId === entry.id}
                        onClick={() =>
                          act(entry.id, () =>
                            authed('DELETE', `${ACCOUNT_BASE}/addresses/${entry.id}`),
                          )
                        }
                      >
                        <svg
                          className="size-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        <span>{t('account.addresses.delete')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* New Address Form Modal/Section */}
      {editing === 'new' && (
        <div className="py-2">
          <AddressForm
            onCancel={() => setEditing(null)}
            onSaved={(list) => {
              setAddresses(list);
              setEditing(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** One saved address, beautifully formatted. */
export function AddressSummary({ address }) {
  const hasNationalAddress =
    address.shortAddress || address.buildingNumber || address.additionalNumber;
  return (
    <address className="space-y-1.5 text-xs sm:text-sm not-italic text-muted-foreground">
      <div className="flex items-start gap-2 text-foreground font-medium">
        <span className="shrink-0 text-muted-foreground mt-0.5">📍</span>
        <span className="leading-snug">{address.line1}</span>
      </div>

      {(address.district || address.city) && (
        <div className="flex items-center gap-2 ps-6 text-muted-foreground">
          <span>{[address.district, address.city].filter(Boolean).join(', ')}</span>
        </div>
      )}

      {hasNationalAddress && (
        <div className="flex flex-wrap items-center gap-2 ps-6 pt-1">
          {address.shortAddress && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300">
              <span>🇸🇦 SPL:</span>
              <span className="uppercase">{address.shortAddress}</span>
            </span>
          )}
          {(address.buildingNumber || address.additionalNumber) && (
            <span className="text-[11px] font-mono text-muted-foreground">
              Bldg: {address.buildingNumber || '—'}
              {address.additionalNumber ? ` · Add: ${address.additionalNumber}` : ''}
            </span>
          )}
          {address.postalCode && (
            <span className="text-[11px] font-mono text-muted-foreground">
              📮 {address.postalCode}
            </span>
          )}
        </div>
      )}

      {address.landmark && (
        <div className="flex items-start gap-2 ps-6 text-[12px] text-muted-foreground/80 italic">
          <span className="not-italic">🧭</span>
          <span>{address.landmark}</span>
        </div>
      )}
    </address>
  );
}

function AddressForm({ initial, onSaved, onCancel }) {
  const t = useT();
  const { authed } = useAuth();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(() => toAddressForm(initial?.address ?? EMPTY_ADDRESS));
  const [isDefault, setIsDefault] = useState(Boolean(initial?.isDefault));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const body = { ...(label ? { label } : {}), address, isDefault };
    const parsed = schemas.addressBody.safeParse(body);
    if (!parsed.success) {
      setErrors(
        detailsToErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const list = initial
        ? await authed('PATCH', `${ACCOUNT_BASE}/addresses/${initial.id}`, parsed.data)
        : await authed('POST', `${ACCOUNT_BASE}/addresses`, parsed.data);
      onSaved(list);
    } catch (err) {
      if (err.details?.length) setErrors(detailsToErrors(err.details));
      setError(
        t(
          err.details?.[0]?.message === 'validation.tooMany'
            ? 'account.addresses.full'
            : 'account.errors.generic',
        ),
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8 shadow-xl shadow-black/5 backdrop-blur-xs">
      <form className="space-y-6" onSubmit={submit} noValidate>
        {/* Form Header */}
        <div className="flex items-center gap-3 border-b border-border/60 pb-5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-xl shadow-xs">
            {initial ? '✏️' : '📍'}
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              {initial ? t('account.addresses.editTitle') : t('account.addresses.newTitle')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter your delivery details and Saudi National Address.
            </p>
          </div>
        </div>

        {/* Name this address with quick-pick chips */}
        <div className="space-y-2">
          <FormField
            label={t('account.addresses.label')}
            description={t('account.addresses.labelHint')}
            error={fieldError(t, errors.label)}
          >
            <PlainTextInput
              maxLength={40}
              placeholder="e.g. Home, Work, Beach House"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-11 rounded-xl border-border/70 bg-background/60 focus:bg-background focus:border-primary transition-all text-sm"
            />
          </FormField>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">Quick pick:</span>
            {[
              { key: 'Home', icon: '🏠', label: 'Home' },
              { key: 'Work', icon: '🏢', label: 'Work' },
              { key: 'Family', icon: '👨‍👩‍👧', label: 'Family' },
              { key: 'Other', icon: '📦', label: 'Other' },
            ].map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setLabel(preset.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                  label === preset.key
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Address Fields (Street, City, District, Saudi National Address, Landmark) */}
        <AddressFields
          value={address}
          onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))}
          error={(field) => fieldError(t, errors[`address.${field}`])}
        />

        {/* Set as Default Address Checkbox Card */}
        <label className="flex items-center gap-3.5 rounded-2xl border border-border/60 bg-muted/20 p-4 hover:bg-muted/40 cursor-pointer transition-colors">
          <input
            type="checkbox"
            className="size-4.5 rounded-md text-primary focus:ring-primary accent-primary cursor-pointer"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <div className="space-y-0.5 select-none">
            <span className="block text-sm font-semibold text-foreground">
              {t('account.addresses.useAsDefault')}
            </span>
            <span className="block text-xs text-muted-foreground">
              Your default delivery location for future checkouts.
            </span>
          </div>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive font-medium flex items-center gap-2"
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border/60">
          <SubmitButton busy={busy} label={t('account.save')} busyLabel={t('account.saving')} />
          <button
            type="button"
            className="h-11 rounded-full border border-border/80 px-6 text-sm font-medium hover:bg-muted transition-colors text-foreground"
            onClick={onCancel}
          >
            {t('account.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
