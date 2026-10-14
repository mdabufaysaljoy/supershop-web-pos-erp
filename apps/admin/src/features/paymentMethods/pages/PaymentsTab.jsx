import { PERMISSIONS } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePaymentSettings } from '@/features/settings/hooks';
import { useCan } from '@/lib/permissions';
import { GatewayCard } from '../components/GatewayCard';
import { MethodRow } from '../components/MethodRow';
import { NewMethodCard } from '../components/NewMethodCard';
import { usePaymentMethods, useReorderMethods } from '../hooks';

/**
 * Settings → Payments (P4.2): what the shop accepts, in which order, at what fee — and the
 * gateway behind the card method. Everything here is data: no deploy to change how a shop is paid.
 */
export function PaymentsTab() {
  const { t } = useTranslation();
  const canEdit = useCan()(PERMISSIONS.SETTINGS_PAYMENTS);
  const methods = usePaymentMethods();
  const settings = usePaymentSettings();
  const reorder = useReorderMethods();

  const move = (id, delta) => {
    const ids = (methods.data ?? []).map((m) => m.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('payments.methods.title')}</h2>
          </CardTitle>
          <CardDescription>{t('payments.methods.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {methods.isPending && (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
          {methods.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('payments.methods.empty')}</p>
          )}
          <ul className="grid gap-3">
            {(methods.data ?? []).map((method, index, all) => (
              <MethodRow
                key={method.id}
                method={method}
                canEdit={canEdit}
                first={index === 0}
                last={index === all.length - 1}
                onMove={move}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      <NewMethodCard canEdit={canEdit} />
      <GatewayCard settings={settings.data} canEdit={canEdit} />
    </div>
  );
}
