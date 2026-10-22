import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS as P } from '@supershop/shared';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/permissions';
import { useOrderAction } from '../resource';

/**
 * The buttons the ORDER says are possible (P4.3's `nextActions`), not a list this page invented:
 * a flow change in the shared config shows up here with no edit. A blocked action stays visible
 * but disabled, with the server's reason as its tooltip — staff can see what is missing.
 */
export function StatusActions({ order }) {
  const { t } = useTranslation();
  const can = useCan();
  const action = useOrderAction(order.id);
  const [confirming, setConfirming] = useState(null);
  const [reason, setReason] = useState('');

  const run = (to, body = {}) => action.mutate({ path: 'transitions', body: { to, ...body } });

  const visible = order.nextActions.filter((a) => a.action !== 'cancel' || can(P.ORDER_CANCEL));
  if (!visible.length)
    return <p className="text-sm text-muted-foreground">{t('orders.actions.none')}</p>;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {visible.map((a) => (
          <Button
            key={a.action}
            type="button"
            variant={a.action === 'cancel' ? 'outline' : 'default'}
            disabled={Boolean(a.blockedBy) || action.isPending}
            title={a.blockedBy ?? undefined}
            onClick={() => (a.action === 'cancel' ? setConfirming(a) : run(a.to))}
          >
            {t(`orders.actions.${a.action}`)}
          </Button>
        ))}
      </div>
      {visible.some((a) => a.blockedBy) && (
        <p className="text-sm text-muted-foreground">
          {visible.find((a) => a.blockedBy).blockedBy}
        </p>
      )}

      {confirming && (
        <div className="grid gap-3 rounded border border-destructive/40 p-4">
          <p className="text-sm font-medium">{t('orders.actions.cancelTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('orders.actions.cancelHelp')}</p>
          <label className="grid gap-1 text-sm">
            {t('orders.actions.cancelReason')}
            <input
              className="h-9 rounded border border-input bg-transparent px-3 text-sm"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={action.isPending}
              onClick={() => {
                run('cancelled', reason ? { reason } : {});
                setConfirming(null);
                setReason('');
              }}
            >
              {t('orders.actions.cancelConfirm')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
