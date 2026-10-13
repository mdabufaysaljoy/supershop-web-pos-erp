import { Suspense } from 'react';
import { ForgotPasswordForm } from '@/components/account/PasswordResetForms';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account/forgot-password',
    title: t('account.forgot.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
