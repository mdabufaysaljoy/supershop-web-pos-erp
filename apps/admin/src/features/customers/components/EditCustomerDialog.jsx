import { FormField, NameInput, PhoneInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/features/settings/components/controls';
import { useUpdateCustomer } from '../resource';

export function EditCustomerDialog({ customer, open, onClose }) {
  const { t } = useTranslation();
  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        closeLabel={t('common.close')}
        aria-describedby={undefined}
        className="max-w-md"
      >
        <DialogTitle className="pe-8">{t('customers.detail.editDialog.title')}</DialogTitle>
        <EditCustomerForm customer={customer} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function EditCustomerForm({ customer, onDone }) {
  const { t } = useTranslation();
  const update = useUpdateCustomer(customer.id);
  const [name, setName] = useState(customer.name ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [status, setStatus] = useState(customer.status ?? 'active');
  const [lang, setLang] = useState(customer.lang ?? 'en');

  const submit = async (e) => {
    e.preventDefault();
    await update.mutateAsync({
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      status,
      lang,
    });
    onDone();
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <FormField label={t('customers.detail.editDialog.name')}>
        <NameInput value={name} onChange={(e) => setName(e.target.value)} required />
      </FormField>

      <FormField label={t('customers.detail.editDialog.phone')}>
        <PhoneInput value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormField>

      <FormField label={t('customers.detail.editDialog.status')}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">{t('customers.status.active')}</option>
          <option value="disabled">{t('customers.status.disabled')}</option>
        </Select>
      </FormField>

      <FormField label={t('customers.detail.language')}>
        <Select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">English</option>
          <option value="ar">العربية (Arabic)</option>
        </Select>
      </FormField>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t('customers.detail.editDialog.cancel')}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {t('customers.detail.editDialog.save')}
        </Button>
      </div>
    </form>
  );
}
