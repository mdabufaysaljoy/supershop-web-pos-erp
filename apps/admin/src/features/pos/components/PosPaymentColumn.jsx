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

/**
 * POS Column 4: taking the money.
 *
 * Only the methods the shop actually offers at a counter can be tendered — they come from the
 * server with the quote (P6.1), and a key it does not know would be refused when the sale is rung
 * up. A sale may be split across several of them: type an amount, or tap a method to settle
 * whatever is still due.
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
  heldButton = null,
  actions = null,
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const known = methods.find((m) => m.key === method);
  const chosen = known?.key ?? methods[0]?.key ?? '';
  const chosenMethod = methods.find((m) => m.key === chosen);
  /** Only cash may be overpaid; the change comes out of the drawer (D-163). */
  const takesChange = chosenMethod?.type === 'cash';
  const canTender = Boolean(chosen) && tender.due > 0;

  const tenderFor = (methodKey, value) => {
    const picked = methods.find((m) => m.key === methodKey);
    if (!picked) return 0;
    const wanted = value ?? halalasTender(amount);
    if (!wanted) return 0;
    // A card or a transfer is taken for exactly what is owed; only cash can be handed over long.
    return picked.type === 'cash' ? wanted : Math.min(wanted, tender.due);
  };

  const add = (value, methodKey = chosen) => {
    const paid = tenderFor(methodKey, value);
    if (!paid) return;
    const item = { method: methodKey, amount: paid };
    if (reference.trim()) item.reference = reference.trim();
    onChange([...payments, item]);
    setAmount('');
    setReference('');
  };

  /** Tap a method to settle what is still due with it — the usual way to split a sale. */
  const addWithMethod = (methodKey) => {
    if (tender.due <= 0) return;
    add(tender.due, methodKey);
  };

  const isContact = customer?.mode === 'contact';
  const customerName = customer?.name && !/walk-?in/i.test(customer.name) ? customer.name : '';
  const customerPhone = customer?.phone ?? '';

  return (
    <div className="flex flex-col h-full overflow-hidden rounded border border-slate-200/90 bg-white p-4 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded bg-emerald-50 text-emerald-600">
            <CreditCard className="size-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {t('pos.payment.title', 'Payment')}
          </h2>
        </div>
        {heldButton}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pe-1">
        {/* Total to pay Display */}
        <div className="flex items-baseline justify-between rounded bg-slate-50 p-3 border border-slate-100">
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
        <div className="rounded border border-slate-200 bg-slate-50/60 p-2.5 flex flex-col gap-1.5">
          {isContact && customerName ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-emerald-100 text-emerald-700">
                  <UserCheck className="size-3.5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {customerName}
                    </span>
                    {customer?.loyalty?.pointsBalance !== undefined && (
                      <span className="inline-flex items-center rounded px-1 text-[9px] font-bold bg-amber-100 text-amber-800">
                        {customer.loyalty.pointsBalance} pts
                      </span>
                    )}
                  </div>
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
                className="h-7 px-2 text-[11px] font-semibold text-primary border-primary/30 hover:bg-primary/5 rounded"
              >
                {t('pos.customer.attach', 'Add a customer')}
              </Button>
            </div>
          )}
        </div>

        {/* Tendered Payments List */}
        {payments.length > 0 && (
          <ul className="rounded border border-slate-100 bg-slate-50/80 p-2 divide-y divide-slate-100 flex flex-col gap-1">
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
            disabled={methods.length === 0}
            aria-label={t('pos.payment.method')}
            className="h-8 rounded text-xs font-medium"
            onChange={(e) => setMethod(e.target.value)}
          >
            {methods.length === 0 ? (
              <option value="">{t('pos.payment.noMethods')}</option>
            ) : (
              methods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))
            )}
          </Select>

          <label htmlFor="payment-amount" className="sr-only">
            {t('pos.payment.amount')}
          </label>
          <MoneyInput
            id="payment-amount"
            value={amount}
            aria-label={t('pos.payment.amount')}
            placeholder="0.00"
            disabled={!canTender}
            className="h-8 rounded border border-slate-200 focus:border-primary text-end text-xs font-semibold px-2"
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
            disabled={!canTender}
            className="h-8 px-2.5 rounded text-xs font-semibold"
            onClick={() => add()}
          >
            {t('pos.payment.add', 'Add')}
          </Button>
        </div>

        {!takesChange && chosen && tender.due > 0 && (
          <p className="text-[10px] text-slate-500">{t('pos.payment.exactOnly')}</p>
        )}

        {/* Optional Reference / Trx ID */}
        <input
          type="text"
          value={reference}
          placeholder={t('pos.payment.referencePlaceholder', 'Trx ID / Mobile ref (optional)')}
          className="h-7 w-full rounded border border-slate-200 bg-slate-50/50 px-2.5 text-[11px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary focus:bg-white font-mono"
          onChange={(e) => setReference(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />

        {/* Hand the exact amount over — one tap for the commonest case of all. */}
        {canTender && (
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

        {/* Settle what is still due with one method — the usual way to split a sale. */}
        {methods.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-slate-400 font-medium text-[10px] me-0.5">
              {t('pos.payment.quick')}
            </span>
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={tender.due <= 0}
                aria-label={t('pos.payment.settleWith', { method: m.label })}
                onClick={() => addWithMethod(m.key)}
                className="flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="size-2 text-slate-400" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tender Balance Indicators (Paid / Due / Change) */}
      <dl className="shrink-0 grid gap-1 text-xs pt-2.5 border-t border-slate-100 mt-2">
        <div className="flex justify-between text-slate-500 text-[11px]">
          <dt>{t('pos.payment.paid', 'Paid')}</dt>
          <dd
            aria-label={t('pos.payment.paid', 'Paid')}
            className="tabular-nums font-medium text-slate-700"
          >
            {fmt.money(tender.paid)}
          </dd>
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

      {/* Sale actions: Complete sale, Clear basket & Hold */}
      {actions}
    </div>
  );
}
