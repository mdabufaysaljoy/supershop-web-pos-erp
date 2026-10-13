import { PURCHASE } from '@supershop/shared';
import { FormField, IntegerInput, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fieldMessage } from '@/lib/i18n';
import { usePurchaseOrderAction } from '../resource';
import { optionLabel } from '../status';

/**
 * Goods arrived: quantities per line (default = everything still expected; 0 = not in this
 * delivery). One Idempotency-Key per dialog, so retrying the same submit can't book twice.
 */
export function ReceiveDialog({ order, open, onOpenChange }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
        <DialogTitle className="pe-8">
          {t('purchaseOrders.receive.title', { poNo: order.poNo })}
        </DialogTitle>
        {open && <ReceiveForm order={order} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReceiveForm({ order, onDone }) {
  const { t } = useTranslation();
  const action = usePurchaseOrderAction(order.id);
  const [key] = useState(() => crypto.randomUUID());
  const open = order.lines.filter((l) => l.qtyReceived < l.qtyOrdered);
  const [qty, setQty] = useState(() =>
    Object.fromEntries(open.map((l) => [l.variantId, String(l.qtyOrdered - l.qtyReceived)])),
  );
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const lines = open
      .map((l) => ({ variantId: l.variantId, qty: Number(qty[l.variantId] || 0) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) return setFormError(t('purchaseOrders.receive.nothing'));
    setFormError(null);
    try {
      await action.mutateAsync({
        action: 'receive',
        body: { lines, ...(reference && { reference }) },
        idempotencyKey: key,
      });
      onDone();
    } catch (err) {
      // Map `lines.<i>.qty` back to the variant row.
      setErrors(
        Object.fromEntries(
          (err?.details ?? []).map((d) => {
            const i = /^lines\.(\d+)\./.exec(d.path)?.[1];
            return [i == null ? d.path : lines[Number(i)].variantId, d.message];
          }),
        ),
      );
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <ul className="grid gap-3">
        {open.map((l) => (
          <li key={l.variantId} className="grid gap-1">
            <FormField
              label={`${l.variant?.productName?.en ?? ''}${optionLabel(l.variant) ? ` · ${optionLabel(l.variant)}` : ''} (${l.variant?.sku ?? ''})`}
              description={t('purchaseOrders.receive.remaining', {
                count: l.qtyOrdered - l.qtyReceived,
              })}
              error={fieldMessage(t, errors[l.variantId])}
            >
              <IntegerInput
                value={qty[l.variantId]}
                onChange={(e) => setQty({ ...qty, [l.variantId]: e.target.value })}
                maxLength={6}
              />
            </FormField>
          </li>
        ))}
      </ul>
      <FormField
        label={t('purchaseOrders.receive.reference')}
        error={fieldMessage(t, errors.reference)}
      >
        <PlainTextInput
          maxLength={PURCHASE.REFERENCE_MAX}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </FormField>
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={action.isPending}>
          {t('purchaseOrders.receive.submit')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
