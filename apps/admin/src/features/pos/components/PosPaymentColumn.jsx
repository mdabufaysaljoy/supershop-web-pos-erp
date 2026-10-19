import { MoneyInput } from '@supershop/ui';
import { CreditCard, Plus, Trash2, User, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';

const halalasTender = (value) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const SAUDI_SPLIT_METHODS = [
  { key: 'mada', label: 'Mada' },
  { key: 'card', label: 'Card' },
  { key: 'apple_pay', label: 'Apple Pay' },
  { key: 'cash', label: 'Cash' },
  { key: 'bank_transfer', label: 'Bank' },
  { key: 'other', label: 'Other' },
];

/**
 * POS Column 4: Dedicated Payment Column
 * Displays total due, customer attachment trigger, payment methods, split tenders, and balance.
 */
export function PosPaymentColumn({
  total,
  tender,
  methods = [],
  payments = [],
  onChange,
  customer,
  onCustomerChange,
  onOpenCustomerModal,
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const chosen = method ?? methods[0]?.key ?? 'cash';

  const add = (value) => {
    const paid = value ?? halalasTender(amount);
    if (!paid) return;
    const item = { method: chosen, amount: paid };
    if (reference.trim()) item.reference = reference.trim();
    onChange([...payments, item]);
    setAmount('');
    setReference('');
  };

  const addWithMethod = (methodKey) => {
    const dueAmount = tender.due > 0 ? tender.due : total;
    if (dueAmount > 0) {
      const item = { method: methodKey, amount: dueAmount };
      if (reference.trim()) item.reference = reference.trim();
      onChange([...payments, item]);
      setReference('');
    }
  };

  const isContact = customer?.mode === 'contact';
  const customerName = customer?.name && !/walk-?in/i.test(customer.name) ? customer.name : '';
  const customerPhone = customer?.phone ?? '';

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CreditCard className="size-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {t('pos.payment.title', 'Payment')}
          </h2>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pe-1">
        {/* Total to pay Display */}
        <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3 border border-slate-100">
          <span className="text-xs font-bold text-slate-600">
            {t('pos.payment.total', 'To pay')}
          </span>
          <output
            aria-label={t('pos.payment.total', 'To pay')}
            className="text-xl font-black text-slate-900 tabular-nums"
          >
            {fmt.money(total)}
          </output>
        </div>

        {/* Customer Attachment Section */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 flex flex-col gap-1.5">
          {isContact && customerName ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <UserCheck className="size-3.5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-900 truncate">{customerName}</span>
                  {customerPhone && (
                    <span className="text-[10px] text-slate-500 font-mono">{customerPhone}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onOpenCustomerModal}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Change
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => onCustomerChange({ mode: 'walkin' })}
                  className="text-[11px] text-slate-400 hover:text-destructive underline"
                >
                  Walk-in
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <User className="size-3.5 text-slate-400" />
                Walk-in customer
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenCustomerModal}
                className="h-7 px-2 text-[11px] font-semibold text-primary border-primary/30 hover:bg-primary/5 rounded-lg"
              >
                {t('pos.customer.attach', 'Add a customer')}
              </Button>
            </div>
          )}
        </div>

        {/* Tendered Payments List */}
        {payments.length > 0 && (
          <ul className="rounded-xl border border-slate-100 bg-slate-50/80 p-2 divide-y divide-slate-100 flex flex-col gap-1">
            {payments.map((payment, index) => (
              <li
                key={`${payment.method}-${index}`}
                className="flex items-center justify-between text-xs py-1"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-slate-700 capitalize text-[11px]">
                    {methods.find((m) => m.key === payment.method)?.label ?? payment.method}
                  </span>
                  {payment.reference && (
                    <span className="text-[10px] text-slate-500 font-mono truncate">
                      Ref: {payment.reference}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-bold tabular-nums text-slate-900 text-xs">
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

        {/* Payment Method Selector & Amount Input */}
        <div className="grid grid-cols-[6.5rem_1fr_auto] gap-1.5 items-center">
          <Select
            value={chosen}
            className="h-8 rounded-lg text-xs font-medium"
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
            className="h-8 rounded-lg border border-rose-300 focus:border-rose-500 text-end text-xs font-semibold px-2"
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
            size="sm"
            className="h-8 px-2.5 rounded-lg text-xs font-semibold"
            onClick={() => add()}
          >
            {t('pos.payment.add', 'Add')}
          </Button>
        </div>

        {/* Optional Reference / Trx ID */}
        <input
          type="text"
          value={reference}
          placeholder={t('pos.payment.referencePlaceholder', 'Trx ID / Mobile ref (optional)')}
          className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 text-[11px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary focus:bg-white font-mono"
          onChange={(e) => setReference(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />

        {/* Exact Amount Helper */}
        {tender.due > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-primary font-medium justify-start p-0 hover:bg-transparent hover:underline"
            onClick={() => add(tender.due)}
          >
            {t('pos.payment.exact', { amount: fmt.money(tender.due) })}
          </Button>
        )}

        {/* Quick Payment Split Buttons */}
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-slate-400 font-medium text-[10px] me-0.5">Quick:</span>
          {(methods.length > 0 ? methods : SAUDI_SPLIT_METHODS).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => addWithMethod(m.key)}
              className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="size-2 text-slate-400" />
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tender Balance Indicators (Paid / Due / Change) */}
      <dl className="grid gap-1 text-xs pt-2.5 border-t border-slate-100 mt-2">
        <div className="flex justify-between text-slate-500 text-[11px]">
          <dt>{t('pos.payment.paid', 'Paid')}</dt>
          <dd className="tabular-nums font-medium text-slate-700">{fmt.money(tender.paid)}</dd>
        </div>
        <div className="flex justify-between font-bold text-xs">
          <dt className={tender.due > 0 ? 'text-amber-700' : 'text-emerald-700'}>
            {tender.due > 0 ? t('pos.payment.due', 'Due') : t('pos.payment.change', 'Change')}
          </dt>
          <dd
            aria-label={
              tender.due > 0 ? t('pos.payment.due', 'Due') : t('pos.payment.change', 'Change')
            }
            className={`tabular-nums ${tender.due > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {fmt.money(tender.due > 0 ? tender.due : tender.change)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
