'use client';

import { createAccountSchemas, createAuthSchemas, LANGUAGES } from '@supershop/shared';
import { FormField, NameInput, PasswordInput, PhoneInput } from '@supershop/ui';
import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { ACCOUNT_BASE, AUTH_BASE, detailsToErrors } from '@/lib/accountApi';
import { fieldError } from '@/lib/fieldError';
import { useAuth } from './AuthProvider';
import { SubmitButton } from './authParts';

/** Profile (name, phone, language) and a password change, both on the account landing page. */
const account = createAccountSchemas();
const auth = createAuthSchemas();
const CARD = 'grid gap-4 rounded-xl border p-5';

export function ProfileView() {
  const t = useT();
  const { profile, setProfile, authed } = useAuth();
  const [form, setForm] = useState({
    name: profile?.name ?? '',
    phone: profile?.phone ?? '',
    lang: profile?.lang ?? LANGUAGES.EN,
  });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, saved: false, error: null });

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setState((s) => ({ ...s, saved: false }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const body = { name: form.name, lang: form.lang, ...(form.phone ? { phone: form.phone } : {}) };
    const parsed = account.updateProfile.safeParse(body);
    if (!parsed.success) {
      setErrors(
        detailsToErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    setErrors({});
    setState({ busy: true, saved: false, error: null });
    try {
      const updated = await authed('PATCH', `${ACCOUNT_BASE}/profile`, parsed.data);
      setProfile((p) => ({ ...p, ...updated }));
      setState({ busy: false, saved: true, error: null });
    } catch (err) {
      if (err.details?.length) setErrors(detailsToErrors(err.details));
      setState({
        busy: false,
        saved: false,
        error: t(
          err.code === 'CONFLICT'
            ? 'account.errors.phoneTaken'
            : err.code === 'NETWORK_ERROR'
              ? 'cart.errors.NETWORK_ERROR'
              : 'account.errors.generic',
        ),
      });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className={CARD} onSubmit={submit} noValidate>
        <h2 className="text-lg font-semibold">{t('account.profile.title')}</h2>
        <FormField label={t('account.name')} error={fieldError(t, errors.name)} required>
          <NameInput
            autoComplete="name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('account.phone')}
          description={t('checkout.phoneHint')}
          error={fieldError(t, errors.phone)}
        >
          <PhoneInput
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <FormField label={t('account.email')} description={t('account.profile.emailHint')}>
          <input
            type="email"
            readOnly
            disabled
            value={profile?.email ?? ''}
            className="h-10 w-full rounded-lg border bg-muted px-3 text-sm text-muted-foreground"
          />
        </FormField>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('account.profile.language')}</legend>
          <div className="flex gap-2">
            {Object.values(LANGUAGES).map((code) => (
              <label
                key={code}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="lang"
                  className="size-4 accent-primary"
                  checked={form.lang === code}
                  onChange={() => set({ lang: code })}
                />
                {t(`account.profile.languages.${code}`)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('account.profile.languageHint')}</p>
        </fieldset>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.saved && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('account.saved')}
          </p>
        )}
        <SubmitButton busy={state.busy} label={t('account.save')} busyLabel={t('account.saving')} />
      </form>

      <ChangePassword />
    </div>
  );
}

/** Changing the password keeps this session and signs the other ones out (handled by the API). */
function ChangePassword() {
  const t = useT();
  const { authed } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, done: false, error: null });

  const submit = async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const parsed = auth.changePassword.safeParse(form);
    if (!parsed.success) {
      setErrors(
        detailsToErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    setErrors({});
    setState({ busy: true, done: false, error: null });
    try {
      await authed('POST', `${AUTH_BASE}/password/change`, parsed.data);
      setForm({ currentPassword: '', newPassword: '' });
      setState({ busy: false, done: true, error: null });
    } catch (err) {
      if (err.details?.length) setErrors(detailsToErrors(err.details));
      setState({
        busy: false,
        done: false,
        error: t(err.status === 401 ? 'account.errors.wrongPassword' : 'account.errors.generic'),
      });
    }
  };

  return (
    <form className={CARD} onSubmit={submit} noValidate>
      <h2 className="text-lg font-semibold">{t('account.password.title')}</h2>
      <FormField
        label={t('account.password.current')}
        error={fieldError(t, errors.currentPassword)}
        required
      >
        <PasswordInput
          showLabel={t('account.password.show')}
          hideLabel={t('account.password.hide')}
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        />
      </FormField>
      <FormField
        label={t('account.password.new')}
        description={t('account.register.passwordHint')}
        error={fieldError(t, errors.newPassword)}
        required
      >
        <PasswordInput
          showLabel={t('account.password.show')}
          hideLabel={t('account.password.hide')}
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
        />
      </FormField>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('account.password.changed')}
        </p>
      )}
      <SubmitButton
        busy={state.busy}
        label={t('account.password.submit')}
        busyLabel={t('account.saving')}
      />
    </form>
  );
}
