import { NameInput, PhoneInput } from '@supershop/ui';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * Who the sale is for (P6.2). A walk-in is the default and needs nothing; a name and number are
 * only asked for when the cashier says there is someone to attach — the till looks them up, it
 * never opens an account for them (D-164).
 */
export function CustomerBar({ customer, onChange }) {
  const { t } = useTranslation();
  const named = customer.mode === 'contact';

  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{t('pos.customer.title')}</span>
        <span className="flex-1 text-sm text-muted-foreground">
          {named ? (customer.name ?? '') : t('pos.customer.walkin')}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange(named ? { mode: 'walkin' } : { mode: 'contact', name: '', phone: '' })
          }
        >
          {named ? t('pos.customer.makeWalkin') : t('pos.customer.attach')}
        </Button>
      </div>

      {named && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            {t('pos.customer.name')}
            <NameInput
              value={customer.name ?? ''}
              onChange={(e) => onChange({ ...customer, name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('pos.customer.phone')}
            <PhoneInput
              value={customer.phone ?? ''}
              onChange={(e) => onChange({ ...customer, phone: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
