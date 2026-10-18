import { Suspense } from 'react';
import { ReceiptView } from '@/components/receipt/ReceiptView';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 0; // Fresh receipt view on scan

export async function generateMetadata({ params }) {
  const { lang, orderNo } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: `/receipt/${orderNo}`,
    title: `${t('receipt.title')} - ${orderNo}`,
    description: t('receipt.description'),
    siteName: settings['store.name'],
  });
}

export default async function ReceiptPage({ params }) {
  const { orderNo } = await params;
  return (
    <div className="min-h-[80vh] px-4 py-4 sm:px-6 sm:py-8">
      <Suspense>
        <ReceiptView orderNo={orderNo} />
      </Suspense>
    </div>
  );
}
