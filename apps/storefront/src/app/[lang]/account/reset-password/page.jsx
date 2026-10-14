import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/account/PasswordResetForms';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account/reset-password',
    title: t('account.reset.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
