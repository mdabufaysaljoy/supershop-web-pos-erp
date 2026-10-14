import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, PlainTextInput } from '@supershop/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';
import { useOrderAction } from '../resource';

/** Parcels already on their way, and the form that sends the next one (which ships the order). */
export function ShipmentCard({ order }) {
  const { t } = useTranslation();
  const action = useOrderAction(order.id);
  const [form, setForm] = useState({ carrier: '', trackingNumber: '', trackingUrl: '' });
  const canShip = ['paid', 'cod_confirmed', 'processing', 'shipped'].includes(order.status);

  const submit = (e) => {
    e.preventDefault();
    if (!form.carrier) return;
    action.mutate(
      {
        path: 'shipments',
        body: {
          carrier: form.carrier,
          ...(form.trackingNumber && { trackingNumber: form.trackingNumber }),
          ...(form.trackingUrl && { trackingUrl: form.trackingUrl }),
        },
      },
      { onSuccess: () => setForm({ carrier: '', trackingNumber: '', trackingUrl: '' }) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('orders.shipments.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {order.shipments.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('orders.shipments.none')}</p>
        )}
        <ul className="grid gap-2">
          {order.shipments.map((s) => (
            <li key={`${s.carrier}-${s.trackingNumber ?? s.shippedAt}`} className="text-sm">
              <span className="font-medium">{s.carrier}</span>
              {s.trackingNumber && (
                <span className="ms-2" dir="ltr">
                  {s.trackingNumber}
                </span>
              )}
              <span className="ms-2 text-muted-foreground">{fmt.dateTime(s.shippedAt)}</span>
            </li>
          ))}
        </ul>

        {canShip && (
          <form className="grid gap-3 border-t pt-4 sm:grid-cols-3" onSubmit={submit} noValidate>
            <FormField label={t('orders.shipments.carrier')} required>
              <PlainTextInput
                maxLength={60}
                value={form.carrier}
                onChange={(e) => setForm({ ...form, carrier: e.target.value })}
              />
            </FormField>
            <FormField label={t('orders.shipments.trackingNumber')}>
              <PlainTextInput
                dir="ltr"
                maxLength={80}
                value={form.trackingNumber}
                onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
              />
            </FormField>
            <FormField label={t('orders.shipments.trackingUrl')}>
              <PlainTextInput
                dir="ltr"
                maxLength={2048}
                placeholder="https://"
                value={form.trackingUrl}
                onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })}
              />
            </FormField>
            <Button
              type="submit"
              disabled={!form.carrier || action.isPending}
              className="sm:col-span-3 sm:justify-self-start"
            >
              {t('orders.shipments.add')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
