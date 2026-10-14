import { useTranslation } from 'react-i18next';
import { fmt } from '@/lib/format';

/**
 * The printable document. It lives in the page (hidden on screen, shown when printing) so the
 * browser's own print dialog does the work — no PDF service, no second fetch, and what staff see
 * on screen is what comes out of the printer. ZATCA's tax-invoice QR lands here with P6.4.
 */
export function OrderInvoice({ order, store }) {
  const { t } = useTranslation();
  const address = order.address ?? {};
  const line = (label, value) =>
    value ? (
      <div className="flex justify-between gap-6">
        <dt>{label}</dt>
        <dd className="text-end">{value}</dd>
      </div>
    ) : null;

  return (
    <section
      aria-label={t('orders.invoice.title')}
      className="hidden print:block print:text-black"
      data-testid="order-invoice"
    >
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold">{store?.name ?? ''}</h1>
          {store?.vatNumber && (
            <p className="text-sm">
              {t('orders.invoice.vatNumber')}: <span dir="ltr">{store.vatNumber}</span>
            </p>
          )}
          {store?.address && <p className="text-sm">{store.address}</p>}
        </div>
        <div className="text-end">
          <h2 className="text-lg font-semibold">{t('orders.invoice.title')}</h2>
          <p className="text-sm">{order.orderNo}</p>
          <p className="text-sm">{fmt.dateTime(order.placedAt)}</p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-medium">{t('orders.invoice.billTo')}</p>
          <p>{order.customer.name}</p>
          <p dir="ltr">{order.customer.phone}</p>
          {order.customer.email && <p dir="ltr">{order.customer.email}</p>}
        </div>
        <div>
          <p className="font-medium">{t('orders.invoice.deliverTo')}</p>
          <p>{[address.line1, address.district, address.city].filter(Boolean).join(', ')}</p>
          {address.postalCode && <p dir="ltr">{address.postalCode}</p>}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-y">
            <th className="py-2 text-start">{t('orders.invoice.item')}</th>
            <th className="py-2 text-end">{t('orders.invoice.qty')}</th>
            <th className="py-2 text-end">{t('orders.invoice.unitPrice')}</th>
            <th className="py-2 text-end">{t('orders.invoice.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.variantId} className="border-b">
              <td className="py-1">
                {i.name}
                {i.options.length > 0 && (
                  <span className="block text-xs">
                    {i.options.map((o) => `${o.name}: ${o.value}`).join(' · ')}
                  </span>
                )}
              </td>
              <td className="py-1 text-end tabular-nums">{fmt.number(i.qty)}</td>
              <td className="py-1 text-end tabular-nums">{fmt.money(i.unitPrice)}</td>
              <td className="py-1 text-end tabular-nums">{fmt.money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ms-auto mt-4 grid w-64 gap-1 text-sm">
        {line(t('orders.invoice.subtotal'), fmt.money(order.totals.subtotal))}
        {order.totals.deliveryFee > 0 &&
          line(t('orders.invoice.delivery'), fmt.money(order.totals.deliveryFee))}
        {order.totals.paymentFee > 0 &&
          line(
            order.payment.label ?? t('orders.invoice.paymentFee'),
            fmt.money(order.totals.paymentFee),
          )}
        {line(t('orders.invoice.vat'), fmt.money(order.totals.vat))}
        <div className="flex justify-between gap-6 border-t pt-1 font-semibold">
          <dt>{t('orders.invoice.total')}</dt>
          <dd className="tabular-nums">{fmt.money(order.totals.total)}</dd>
        </div>
      </dl>

      <p className="mt-6 text-xs">
        {t('orders.invoice.paidWith', {
          method: order.payment.label ?? order.payment.method,
          status: t(`orders.paymentStatus.${order.payment.status}`),
        })}
      </p>
    </section>
  );
}
