import { PAYMENT_METHOD, PERMISSIONS } from '@supershop/shared';
import { Globe, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePaymentSettings } from '@/features/settings/hooks';
import { useCan } from '@/lib/permissions';
import { GatewayCard } from '../components/GatewayCard';
import { MethodRow } from '../components/MethodRow';
import { NewMethodCard } from '../components/NewMethodCard';
import { usePaymentMethods, useReorderMethods } from '../hooks';

/**
 * Settings → Payments (P4.2), arranged by WHERE the money is taken rather than as one list: a
 * cashier's question is "what can I take at the counter", and a shop's is "what can a customer
 * pay with online". A method's TYPE decides where it can appear —
 *   cash: the counter only · card gateway and cash on delivery: online only ·
 *   bank transfer (offline) and wallets (MFS): both —
 * so a method that works in both places is listed in both, marked as such.
 */
const WHERE = {
  pos: { types: PAYMENT_METHOD.POS_TYPES, icon: Store },
  online: { types: PAYMENT_METHOD.ONLINE_TYPES, icon: Globe },
};

export function PaymentsTab() {
  const { t } = useTranslation();
  const canEdit = useCan()(PERMISSIONS.SETTINGS_PAYMENTS);
  const methods = usePaymentMethods();
  const settings = usePaymentSettings();
  const reorder = useReorderMethods();

  /** Reordering is over the whole list; a section moves a method past its neighbour in it. */
  const move = (id, delta) => {
    const ids = (methods.data ?? []).map((m) => m.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
  };

  const all = methods.data ?? [];
  const section = (where) => all.filter((m) => WHERE[where].types.includes(m.type));

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{t('payments.intro')}</p>

      <ChannelCard
        where="pos"
        methods={section('pos')}
        all={all}
        canEdit={canEdit}
        loading={methods.isPending}
        onMove={move}
      />

      <ChannelCard
        where="online"
        methods={section('online')}
        all={all}
        canEdit={canEdit}
        loading={methods.isPending}
        onMove={move}
      >
        <GatewayCard settings={settings.data} canEdit={canEdit} />
      </ChannelCard>

      <NewMethodCard canEdit={canEdit} />
    </div>
  );
}

/** One place the shop takes money: the methods that work there, in the order customers see them. */
function ChannelCard({ where, methods, all, canEdit, loading, onMove, children }) {
  const { t } = useTranslation();
  const Icon = WHERE[where].icon;
  const other = where === 'pos' ? 'online' : 'pos';

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Icon className="size-4 text-primary" aria-hidden />
            {t(`payments.where.${where}.title`)}
            <Badge tone="muted">{methods.length}</Badge>
          </h2>
        </CardTitle>
        <CardDescription>{t(`payments.where.${where}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {!loading && methods.length === 0 && (
          <p className="text-sm text-muted-foreground">{t(`payments.where.${where}.empty`)}</p>
        )}
        <ul className="grid gap-3">
          {methods.map((method) => (
            <MethodRow
              key={method.id}
              method={method}
              canEdit={canEdit}
              first={all.indexOf(method) === 0}
              last={all.indexOf(method) === all.length - 1}
              onMove={onMove}
              note={
                WHERE[other].types.includes(method.type)
                  ? t(`payments.where.${other}.alsoHere`)
                  : null
              }
            />
          ))}
        </ul>
        {children}
      </CardContent>
    </Card>
  );
}
