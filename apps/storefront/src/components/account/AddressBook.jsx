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
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {addresses.length === 0 && editing !== 'new' && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('account.addresses.empty')}
        </p>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {addresses.map((entry) => (
          <li key={entry.id} className="rounded-xl border p-5">
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
              <div className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{entry.label || t('account.addresses.untitled')}</h3>
                  {entry.isDefault && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {t('account.addresses.default')}
                    </span>
                  )}
                </div>
                <AddressSummary address={entry.address} />
                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => setEditing(entry.id)}
                  >
                    {t('account.addresses.edit')}
                  </button>
                  {!entry.isDefault && (
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      disabled={busyId === entry.id}
                      onClick={() =>
                        act(entry.id, () =>
                          authed('PATCH', `${ACCOUNT_BASE}/addresses/${entry.id}`, {
                            isDefault: true,
                          }),
                        )
                      }
                    >
                      {t('account.addresses.makeDefault')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-destructive underline underline-offset-4"
                    disabled={busyId === entry.id}
                    onClick={() =>
                      act(entry.id, () => authed('DELETE', `${ACCOUNT_BASE}/addresses/${entry.id}`))
                    }
                  >
                    {t('account.addresses.delete')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <div className="rounded-xl border p-5">
          <AddressForm
            onCancel={() => setEditing(null)}
            onSaved={(list) => {
              setAddresses(list);
              setEditing(null);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="h-11 justify-self-start rounded-full border px-5 text-sm font-medium hover:bg-muted"
          onClick={() => setEditing('new')}
        >
          {t('account.addresses.add')}
        </button>
      )}
    </div>
  );
}

/** One saved address, as a few readable lines. */
export function AddressSummary({ address }) {
  const parts = [
    address.line1,
    address.district,
    [address.buildingNumber, address.city].filter(Boolean).join(' '),
    [address.postalCode, address.additionalNumber].filter(Boolean).join('-'),
    address.shortAddress,
    address.landmark,
  ].filter(Boolean);
  return (
    <address className="text-sm not-italic text-muted-foreground">
      {parts.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
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
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <h3 className="text-lg font-semibold">
        {initial ? t('account.addresses.editTitle') : t('account.addresses.newTitle')}
      </h3>
      <FormField
        label={t('account.addresses.label')}
        description={t('account.addresses.labelHint')}
        error={fieldError(t, errors.label)}
      >
        <PlainTextInput maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
      </FormField>
      <AddressFields
        value={address}
        onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))}
        error={(field) => fieldError(t, errors[`address.${field}`])}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        {t('account.addresses.useAsDefault')}
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <SubmitButton busy={busy} label={t('account.save')} busyLabel={t('account.saving')} />
        <button type="button" className="h-11 rounded-full border px-5 text-sm" onClick={onCancel}>
          {t('account.cancel')}
        </button>
      </div>
    </form>
  );
}
