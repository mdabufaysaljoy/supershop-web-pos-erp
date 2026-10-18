import { PERMISSIONS as P, tenderSummary } from '@supershop/shared';
import { MoneyInput, NameInput, PhoneInput } from '@supershop/ui';
import { Pause, Plus, Trash2, User, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';

/** "5.00" → 500 halalas; anything that is not a number clears the discount. */
const halalas = (value) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

const halalasTender = (value) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/** Saudi Arabia quick payment methods */
const SAUDI_SPLIT_METHODS = [
  { key: 'mada', label: 'Mada' },
  { key: 'card', label: 'Card' },
  { key: 'apple_pay', label: 'Apple Pay' },
  { key: 'cash', label: 'Cash' },
  { key: 'bank_transfer', label: 'Bank' },
  { key: 'other', label: 'Other' },
];

export function PaymentPanel({
  total,
  subtotal = total,
  methods = [],
  payments = [],
  onChange,
  onComplete,
  busy,
  blocked,
  sale,
  onOrderDiscount,
  onCustomerChange,
  onHold,
  onClear,
  heldCount = 0,
  onToggleHeld,
  children,
}) {
  const { t } = useTranslation();
  const can = useCan();
  const mayDiscount = can(P.POS_DISCOUNT);

  const [method, setMethod] = useState(null);
  const [amount, setAmount] = useState('');
  const [discountType, setDiscountType] = useState('amount');
  const [customerOpen, setCustomerOpen] = useState(false);

  const tender = useMemo(() => tenderSummary(total, payments), [total, payments]);
  const chosen = method ?? methods[0]?.key ?? 'cash';

  const add = (value) => {
    const paid = value ?? halalasTender(amount);
    if (!paid) return;
    onChange([...payments, { method: chosen, amount: paid }]);
    setAmount('');
  };

  const addWithMethod = (methodKey) => {
    const dueAmount = tender.due > 0 ? tender.due : total;
    if (dueAmount > 0) {
      onChange([...payments, { method: methodKey, amount: dueAmount }]);
    }
  };

  const customer = sale?.customer ?? { mode: 'walkin' };
  const named = customer.mode === 'contact';
  const lineCount = sale?.lines?.length ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs flex flex-col overflow-hidden">
      {/* Basket Header */}
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <h2 className="text-sm font-bold text-slate-900">Basket · {lineCount} line(s)</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
          onClick={onToggleHeld}
        >
          <Pause className="size-3.5" />
          <span>Held{heldCount > 0 ? ` (${heldCount})` : ''}</span>
        </Button>
      </div>

      {/* Basket Items List */}
      <div className="flex-1 min-h-[140px]">{children}</div>

      {/* Financial Summary & Settlement Section */}
      <div className="border-t border-slate-100 bg-white p-5 flex flex-col gap-3.5">
        {/* Subtotal */}
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Subtotal (incl. VAT)</span>
          <span className="font-semibold text-slate-800 tabular-nums">{fmt.money(subtotal)}</span>
        </div>

        {/* Discount */}
        {mayDiscount && (
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Discount</span>
            <div className="flex items-center gap-2">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none"
              >
                <option value="amount">Amount</option>
                <option value="percent">Percent</option>
              </select>
              <MoneyInput
                value={sale?.orderDiscount?.type === 'amount' ? sale.orderDiscount.value / 100 : ''}
                aria-label={t('pos.lines.orderDiscount', 'Off the whole basket')}
                placeholder="0.00"
                className="h-8 w-24 rounded-lg border border-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 text-rose-600 text-end text-xs font-semibold px-2 outline-none"
                onChange={(e) =>
                  onOrderDiscount(
                    halalas(e.target.value) && {
                      type: 'amount',
                      value: halalas(e.target.value),
                    },
                  )
                }
              />
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex items-baseline justify-between pt-1 border-t border-slate-100/80">
          <span className="text-sm font-bold text-slate-900">{t('pos.payment.total')}</span>
          <output
            aria-label={t('pos.payment.total')}
            className="text-2xl font-black text-slate-900 tabular-nums"
          >
            {fmt.money(total)}
          </output>
        </div>

        {/* Customer Button / Expandable Input */}
        <div className="grid gap-2">
          {!named && !customerOpen ? (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-start text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => {
                setCustomerOpen(true);
                onCustomerChange({ mode: 'contact', name: '', phone: '' });
              }}
            >
              <User className="size-4 text-slate-400" />
              <span>{t('pos.customer.attach', 'Add a customer')}</span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <UserCheck className="size-3.5 text-primary" />
                  {t('pos.customer.title')}
                </span>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-destructive underline"
                  onClick={() => {
                    setCustomerOpen(false);
                    onCustomerChange({ mode: 'walkin' });
                  }}
                >
                  {t('pos.customer.makeWalkin', 'Make it a walk-in')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[11px] font-medium text-slate-600">
                  {t('pos.customer.name')}
                  <NameInput
                    value={customer.name ?? ''}
                    placeholder="Name"
                    aria-label={t('pos.customer.name')}
                    className="h-8 rounded-lg text-xs"
                    onChange={(e) => onCustomerChange({ ...customer, name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-[11px] font-medium text-slate-600">
                  {t('pos.customer.phone')}
                  <PhoneInput
                    value={customer.phone ?? ''}
                    placeholder="05XXXXXXXX"
                    aria-label={t('pos.customer.phone')}
                    className="h-8 rounded-lg text-xs"
                    onChange={(e) => onCustomerChange({ ...customer, phone: e.target.value })}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Tendered Payments List */}
        {payments.length > 0 && (
          <ul className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 divide-y divide-slate-100 grid gap-1">
            {payments.map((payment, index) => (
              <li
                key={`${payment.method}-${index}`}
                className="flex items-center justify-between text-xs py-1"
              >
                <span className="font-medium text-slate-700 capitalize">
                  {methods.find((m) => m.key === payment.method)?.label ?? payment.method}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums text-slate-900">
                    {fmt.money(payment.amount)}
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-destructive"
                    onClick={() => onChange(payments.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Primary Payment Selector and Amount Input */}
        <div className="grid grid-cols-[8.5rem_1fr_auto] gap-2 items-center">
          <Select
            value={chosen}
            className="h-10 rounded-xl text-xs font-medium"
            onChange={(e) => setMethod(e.target.value)}
          >
            {methods.length > 0
              ? methods.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))
              : SAUDI_SPLIT_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
          </Select>

          <label htmlFor="payment-amount" className="sr-only">
            {t('pos.payment.amount')}
          </label>
          <MoneyInput
            id="payment-amount"
            value={amount}
            aria-label={t('pos.payment.amount')}
            placeholder="0.00"
            className="h-10 rounded-xl border border-rose-300 focus:border-rose-500 text-end text-sm font-semibold px-3"
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />

          <Button
            type="button"
            variant="outline"
            className="h-10 px-3 rounded-xl text-xs font-semibold"
            onClick={() => add()}
          >
            {t('pos.payment.add')}
          </Button>
        </div>

        {/* Exact Amount Helper */}
        {tender.due > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-primary font-medium justify-start p-0 hover:bg-transparent hover:underline"
            onClick={() => add(tender.due)}
          >
            {t('pos.payment.exact', { amount: fmt.money(tender.due) })}
          </Button>
        )}

        {/* Saudi Split Payment Quick Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-medium">{t('pos.split', 'Split:')}</span>
          {SAUDI_SPLIT_METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => addWithMethod(m.key)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="size-2.5" />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Tender Balance Indicators */}
        <dl className="grid gap-1 text-xs pt-1 border-t border-slate-100">
          <div className="flex justify-between text-slate-500">
            <dt>{t('pos.payment.paid')}</dt>
            <dd className="tabular-nums font-medium text-slate-700">{fmt.money(tender.paid)}</dd>
          </div>
          <div className="flex justify-between font-bold">
            <dt className={tender.due > 0 ? 'text-amber-700' : 'text-emerald-700'}>
              {tender.due > 0 ? t('pos.payment.due') : t('pos.payment.change')}
            </dt>
            <dd
              aria-label={tender.due > 0 ? t('pos.payment.due') : t('pos.payment.change')}
              className={`tabular-nums ${tender.due > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
            >
              {fmt.money(tender.due > 0 ? tender.due : tender.change)}
            </dd>
          </div>
        </dl>

        {/* Complete Sale Action */}
        <Button
          type="button"
          disabled={busy || blocked || !payments.length || tender.due > 0}
          onClick={onComplete}
          className="h-12 w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-sm transition-all disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('pos.payment.complete')}
        </Button>

        {/* Clear and Hold Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
            disabled={!lineCount}
            onClick={onClear}
          >
            {t('pos.clear', 'Clear')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
            disabled={!lineCount}
            onClick={onHold}
          >
            <Pause className="size-3.5 me-1 text-slate-500" />
            {t('pos.held.hold')}
          </Button>
        </div>
      </div>
    </div>
  );
}
