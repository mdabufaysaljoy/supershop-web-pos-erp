import { tenderSummary } from '@supershop/shared';
import { MoneyInput } from '@supershop/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';

/**
 * Taking the money (P6.2): one tender or several, a quick "exact" button, and the change to hand
 * back shown before the sale is rung up — the cashier should never have to work it out.
 *
 * `tenderSummary` is the same function the server uses, so the figure on screen is the figure the
 * receipt will carry.
 */
const halalas = (value) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export function PaymentPanel({ total, methods, payments, onChange, onComplete, busy, blocked }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState(null);
  const [amount, setAmount] = useState('');
  const tender = useMemo(() => tenderSummary(total, payments), [total, payments]);
  const chosen = method ?? methods[0]?.key ?? '';

  const add = (value) => {
    const paid = value ?? halalas(amount);
    if (!paid) return;
    onChange([...payments, { method: chosen, amount: paid }]);
    setAmount('');
  };

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{t('pos.payment.total')}</span>
        <output aria-label={t('pos.payment.total')} className="text-2xl font-semibold tabular-nums">
          {fmt.money(total)}
        </output>
      </div>

      {payments.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {payments.map((payment, index) => (
            <li key={`${payment.method}-${index}`} className="flex items-center gap-2">
              <span className="flex-1">
                {methods.find((m) => m.key === payment.method)?.label ?? payment.method}
              </span>
              <span className="tabular-nums">{fmt.money(payment.amount)}</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => onChange(payments.filter((_, i) => i !== index))}
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm">
          {t('pos.payment.method')}
          <Select value={chosen} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('pos.payment.amount')}
          <MoneyInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </label>
        <Button type="button" variant="outline" onClick={() => add()}>
          {t('pos.payment.add')}
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={tender.due === 0}
        onClick={() => add(tender.due)}
      >
        {t('pos.payment.exact', { amount: fmt.money(tender.due) })}
      </Button>

      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between">
          <dt>{t('pos.payment.paid')}</dt>
          <dd className="tabular-nums">{fmt.money(tender.paid)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>{tender.due > 0 ? t('pos.payment.due') : t('pos.payment.change')}</dt>
          <dd
            aria-label={tender.due > 0 ? t('pos.payment.due') : t('pos.payment.change')}
            className="tabular-nums"
          >
            {fmt.money(tender.due > 0 ? tender.due : tender.change)}
          </dd>
        </div>
      </dl>

      <Button
        type="button"
        size="lg"
        disabled={busy || blocked || !payments.length || tender.due > 0}
        onClick={onComplete}
      >
        {busy ? t('common.saving') : t('pos.payment.complete')}
      </Button>
    </div>
  );
}
