'use client';

import { formatMoney } from '@supershop/shared';
import { QrCode } from '@supershop/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLang, useT } from '@/i18n/I18nProvider';
import { checkoutRequest } from '@/lib/checkout';

export function ReceiptView({ orderNo }) {
  const t = useT();
  const lang = useLang();
  const [state, setState] = useState({ loading: true, receipt: null, error: null });

  useEffect(() => {
    let active = true;

    checkoutRequest('GET', `/receipt/${encodeURIComponent(orderNo)}`, { lang })
      .then((data) => {
        if (active) setState({ loading: false, receipt: data, error: null });
      })
      .catch((err) => {
        if (active) {
          setState({
            loading: false,
            receipt: null,
            error: err.status === 404 ? 'receipt.notFound' : 'track.failed',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [orderNo, lang]);

  const money = (val) =>
    formatMoney(val ?? 0, {
      currency: state.receipt?.currency ?? 'SAR',
      lang,
    });

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat(`${lang}-SA`, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Riyadh',
      }).format(d);
    } catch {
      return String(iso);
    }
  };

  if (state.loading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 py-20">
        <div className="size-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="text-sm text-neutral-500">{t('track.searching')}</p>
      </div>
    );
  }

  if (state.error || !state.receipt) {
    return (
      <div className="mx-auto my-12 w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900">
          {t(state.error ?? 'receipt.notFound')}
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          {t('track.orderNumber')}: <span className="font-mono font-medium">{orderNo}</span>
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href={`/${lang}`}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-neutral-800"
          >
            {t('receipt.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  const { receipt } = state;
  const isPaid = receipt.status !== 'cancelled' && receipt.status !== 'refunded';

  return (
    <div className="mx-auto w-full max-w-2xl py-4 sm:py-8">
      {/* Printable Receipt Card */}
      <div
        id="digital-receipt-card"
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-md print:border-none print:shadow-none"
      >
        {/* Top Header & Verified Banner */}
        <div className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/70 to-white px-6 py-6 text-center sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100/70 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-xs">
            <svg className="size-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{t('receipt.verified')}</span>
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
            {receipt.shop?.name || 'Supershop'}
          </h1>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
            {t('receipt.simplifiedInvoice')}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-neutral-600">
            {receipt.shop?.address && <span>{receipt.shop.address}</span>}
            {receipt.shop?.phone && <span>{receipt.shop.phone}</span>}
            {receipt.shop?.vatNumber && (
              <span className="font-medium text-neutral-800">
                {t('receipt.vat')}: {receipt.shop.vatNumber}
              </span>
            )}
          </div>
        </div>

        {/* Invoice Metadata */}
        <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 bg-neutral-50/50 p-6 sm:grid-cols-4 sm:px-8">
          <div>
            <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-500">
              {t('receipt.orderNumber')}
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-neutral-900">
              {receipt.orderNo}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-500">
              {t('receipt.date')}
            </div>
            <div className="mt-1 text-xs font-semibold text-neutral-800">
              {formatDate(receipt.placedAt)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-500">
              {receipt.branchName ? t('receipt.branch') : t('receipt.cashier')}
            </div>
            <div className="mt-1 text-xs font-semibold text-neutral-800">
              {receipt.branchName || receipt.cashierName || 'Store Main'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-500">
              {t('receipt.status')}
            </div>
            <div className="mt-1">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                  isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-800'
                }`}
              >
                {isPaid ? t('receipt.paid') : receipt.status}
              </span>
            </div>
          </div>
        </div>

        {/* Customer if present */}
        {receipt.customerName && (
          <div className="border-b border-neutral-100 px-6 py-2.5 text-xs text-neutral-600 sm:px-8">
            <span className="font-medium text-neutral-500">{t('receipt.customer')}: </span>
            <span className="font-semibold text-neutral-800">{receipt.customerName}</span>
          </div>
        )}

        {/* Itemized Table */}
        <div className="px-6 py-4 sm:px-8">
          <h2 className="mb-3 text-xs font-bold tracking-wider uppercase text-neutral-500">
            {t('receipt.items')} ({receipt.totals?.itemCount ?? receipt.items?.length ?? 0})
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="pb-2 font-semibold">{t('receipt.item')}</th>
                  <th className="pb-2 text-center font-semibold">{t('receipt.qty')}</th>
                  <th className="pb-2 text-right font-semibold">{t('receipt.price')}</th>
                  <th className="pb-2 text-right font-semibold">{t('receipt.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(receipt.items ?? []).map((item, idx) => (
                  <tr key={`${item.sku || item.name}-${idx}`} className="group">
                    <td className="py-3 pr-2">
                      {/* A customer's receipt names the product, not the shop's own code. */}
                      <div className="font-medium text-neutral-900">{item.name}</div>
                    </td>
                    <td className="py-3 text-center font-medium text-neutral-700">{item.qty}</td>
                    <td className="py-3 text-right text-neutral-600">{money(item.unitPrice)}</td>
                    <td className="py-3 text-right font-semibold text-neutral-900">
                      {money(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="border-t border-dashed border-neutral-200 bg-neutral-50/30 px-6 py-4 sm:px-8">
          <div className="space-y-1.5 text-xs text-neutral-600">
            <div className="flex justify-between">
              <span>{t('receipt.subtotal')}</span>
              <span className="font-medium text-neutral-800">
                {money(receipt.totals?.subtotal)}
              </span>
            </div>

            {Boolean(receipt.totals?.discountTotal) && (
              <div className="flex justify-between text-emerald-700">
                <span>{t('receipt.discount')}</span>
                <span className="font-medium">-{money(receipt.totals?.discountTotal)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>{t('receipt.taxableNet')}</span>
              <span className="font-medium text-neutral-800">{money(receipt.totals?.net)}</span>
            </div>

            <div className="flex justify-between">
              <span>{t('receipt.vat')}</span>
              <span className="font-medium text-neutral-800">{money(receipt.totals?.vat)}</span>
            </div>

            <div className="my-2 border-t border-neutral-200" />

            <div className="flex items-baseline justify-between text-sm font-bold text-neutral-900">
              <span className="text-base">{t('receipt.grandTotal')}</span>
              <span className="text-xl font-extrabold text-neutral-900">
                {money(receipt.totals?.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment & Tender Details */}
        {(receipt.payments?.length > 0 || receipt.changeGiven > 0) && (
          <div className="border-t border-neutral-100 px-6 py-4 sm:px-8">
            <h3 className="mb-2 text-[11px] font-bold tracking-wider uppercase text-neutral-500">
              {t('receipt.paymentDetails')}
            </h3>
            <div className="space-y-1 text-xs">
              {(receipt.payments ?? []).map((p, idx) => (
                <div key={idx} className="flex justify-between text-neutral-700">
                  <span className="font-medium capitalize">{p.label || p.method}</span>
                  <span className="font-semibold text-neutral-900">{money(p.amount)}</span>
                </div>
              ))}
              {Boolean(receipt.changeGiven) && (
                <div className="flex justify-between text-neutral-700">
                  <span className="font-medium">{t('receipt.change')}</span>
                  <span className="font-semibold text-neutral-900">
                    {money(receipt.changeGiven)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ZATCA Tax Invoice QR & Online Verification */}
        {receipt.zatcaQr && (
          <div className="border-t border-neutral-100 bg-neutral-50/50 p-6 text-center sm:px-8">
            <div className="mx-auto flex flex-col items-center gap-2">
              <div className="rounded-xl border border-neutral-200 bg-white p-2 shadow-xs">
                <QrCode value={receipt.zatcaQr} size={220} title={t('receipt.zatcaTitle')} />
              </div>
              <div className="text-xs font-semibold text-neutral-800">
                {t('receipt.zatcaTitle')}
              </div>
              <p className="max-w-xs text-[11px] leading-relaxed text-neutral-500">
                {t('receipt.zatcaDescription')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons (Hidden when printing) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 px-2 print:hidden">
        <Link
          href={`/${lang}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 shadow-xs hover:bg-neutral-50"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          {t('receipt.backHome')}
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-98"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          {t('receipt.print')}
        </button>
      </div>
    </div>
  );
}
