'use client';

import { createAuthSchemas } from '@supershop/shared';
import { EmailInput, FormField, PasswordInput } from '@supershop/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_PATHS, apiRequest, AUTH_BASE, detailsToErrors } from '@/lib/accountApi';
import { fieldError } from '@/lib/fieldError';
import { AuthCard, SubmitButton } from './authParts';

const schemas = createAuthSchemas();

/**
 * Ask for a reset link. The API always answers the same way (202), whether or not the address is
 * known, so this page cannot be used to find out who has an account (§5.1).
 */
export function ForgotPasswordForm() {
  const t = useT();
  const lang = useLang();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest('POST', `${AUTH_BASE}/password/forgot`, { body: { email } });
      setSent(true);
    } catch (err) {
      setError(
        t(err.code === 'RATE_LIMITED' ? 'account.errors.tooMany' : 'account.errors.generic'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={t('account.forgot.title')}
      description={t('account.forgot.description')}
      error={error}
      success={sent ? t('account.forgot.sent') : null}
    >
      {!sent && (
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <FormField label={t('account.email')} required>
            <EmailInput
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <SubmitButton
            busy={busy}
            label={t('account.forgot.submit')}
            busyLabel={t('account.forgot.submitting')}
          />
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link
          className="underline underline-offset-4"
          href={localizePath(ACCOUNT_PATHS.login, lang)}
        >
          {t('account.backToSignIn')}
        </Link>
      </p>
    </AuthCard>
  );
}

/** Set a new password with the one-time token from the email link. */
export function ResetPasswordForm() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const parsed = schemas.resetPassword.safeParse({ token, password });
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
      await apiRequest('POST', `${AUTH_BASE}/password/reset`, { body: parsed.data });
      router.replace(`${localizePath(ACCOUNT_PATHS.login, lang)}?reset=1`);
    } catch (err) {
      if (err.details?.length) setErrors(detailsToErrors(err.details));
      else
        setError(
          t(err.code === 'TOKEN_INVALID' ? 'account.reset.expired' : 'account.errors.generic'),
        );
      setBusy(false);
    }
  };

  if (!token)
    return (
      <AuthCard title={t('account.reset.title')} error={t('account.reset.expired')}>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            className="underline underline-offset-4"
            href={localizePath(ACCOUNT_PATHS.forgot, lang)}
          >
            {t('account.reset.askAgain')}
          </Link>
        </p>
      </AuthCard>
    );

  return (
    <AuthCard
      title={t('account.reset.title')}
      description={t('account.reset.description')}
      error={error}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <FormField
          label={t('account.reset.newPassword')}
          description={t('account.register.passwordHint')}
          error={fieldError(t, errors.password)}
          required
        >
          <PasswordInput
            showLabel={t('account.password.show')}
            hideLabel={t('account.password.hide')}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <SubmitButton
          busy={busy}
          label={t('account.reset.submit')}
          busyLabel={t('account.reset.submitting')}
        />
      </form>
    </AuthCard>
  );
}
