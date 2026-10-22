import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlainTextArea } from '@supershop/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';
import { useOrderAction } from '../resource';

/** What the shop tells itself about this order. Never shown to the customer. */
export function NotesCard({ order }) {
  const { t } = useTranslation();
  const action = useOrderAction(order.id);
  const [text, setText] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    action.mutate({ path: 'notes', body: { text } }, { onSuccess: () => setText('') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('orders.notes.title')}</h2>
        </CardTitle>
        <CardDescription>{t('orders.notes.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {order.note && (
          <p className="rounded bg-muted p-3 text-sm">
            <span className="font-medium">{t('orders.notes.fromCustomer')}: </span>
            {order.note}
          </p>
        )}
        <ul className="grid gap-3">
          {order.notes.map((n) => (
            <li key={`${n.at}-${n.text}`} className="grid gap-0.5 text-sm">
              <span>{n.text}</span>
              <span className="text-xs text-muted-foreground">
                {n.staffName ?? t('orders.notes.someone')} · {fmt.dateTime(n.at)}
              </span>
            </li>
          ))}
        </ul>
        <form className="grid gap-2" onSubmit={submit} noValidate>
          <PlainTextArea
            rows={2}
            maxLength={500}
            aria-label={t('orders.notes.add')}
            placeholder={t('orders.notes.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            type="submit"
            disabled={!text.trim() || action.isPending}
            className="justify-self-start"
          >
            {t('orders.notes.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
