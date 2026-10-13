'use client';

import { createAuthSchemas } from '@supershop/shared';
import { EmailInput, FormField, NameInput, PasswordInput, PhoneInput } from '@supershop/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_PATHS, AUTH_BASE, detailsToErrors } from '@/lib/accountApi';
import { fieldError } from '@/lib/fieldError';
import { useAuth } from './AuthProvider';
import { AuthCard, GoogleButton, SubmitButton, useReturnTo } from './authParts';

/** Create an account: the same contact details guest checkout asks for, plus a password. */
const schemas = createAuthSchemas();

export function RegisterForm({ googleEnabled }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { register } = useAuth();
  const returnTo = useReturnTo();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const err = (path) => fieldError(t, errors[path]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const body = { ...form, phone: form.phone || undefined };
    const parsed = schemas.customerRegister.safeParse(body);
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
      await register(parsed.data);
      router.replace(localizePath(returnTo, lang));
    } catch (error) {
      if (error.code === 'CONFLICT') {
        const fields = error.details?.fields ?? [];
        setErrors(Object.fromEntries(fields.map((f) => [f, t('validation.duplicate')])));
        setFormError(t('account.errors.exists'));
      } else if (error.details?.length) {
        setErrors(detailsToErrors(error.details));
      } else {
        setFormError(
          t(
            error.code === 'NETWORK_ERROR' ? 'cart.errors.NETWORK_ERROR' : 'account.errors.generic',
          ),
        );
      }
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('account.register.title')} error={formError}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <FormField label={t('account.name')} error={err('name')} required>
          <NameInput
            autoComplete="name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label={t('account.email')} error={err('email')} required>
          <EmailInput
            autoComplete="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('account.phone')}
          description={t('checkout.phoneHint')}
          error={err('phone')}
        >
          <PhoneInput
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('account.password.label')}
          description={t('account.register.passwordHint')}
          error={err('password')}
          required
        >
          <PasswordInput
            showLabel={t('account.password.show')}
            hideLabel={t('account.password.hide')}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
          />
        </FormField>
        <SubmitButton
          busy={busy}
          label={t('account.register.submit')}
          busyLabel={t('account.register.submitting')}
        />
      </form>

      {googleEnabled && (
        <GoogleButton
          label={t('account.register.google')}
          href={`${AUTH_BASE}/google/start?returnTo=${encodeURIComponent(localizePath(returnTo, lang))}`}
          or={t('account.or')}
        />
      )}

      <p className="text-center text-sm text-muted-foreground">
        {t('account.register.haveAccount')}{' '}
        <Link
          className="underline underline-offset-4"
          href={localizePath(ACCOUNT_PATHS.login, lang)}
        >
          {t('account.register.signInLink')}
        </Link>
      </p>
    </AuthCard>
  );
}
