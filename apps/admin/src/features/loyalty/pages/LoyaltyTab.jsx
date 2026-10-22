import { Coins, CreditCard, Gift, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/features/settings/components/controls';
import { useSaveSettings, useSettings } from '@/features/settings/hooks';

/**
 * Settings → Loyalty & Rewards Program Tab
 * Configures earn spend rate (e.g. 100 SAR = 1 point), card issuance fee, redemption, and expiry.
 */
export function LoyaltyTab() {
  const { data: customerSettings, isPending: pendingCustomers } = useSettings('customers');
  const { data: featureSettings, isPending: pendingFeatures } = useSettings('features');

  if (pendingCustomers || pendingFeatures) return <Skeleton className="h-96" />;

  return (
    <LoyaltySettingsForm
      key={`${customerSettings?.length ?? 0}-${featureSettings?.length ?? 0}`}
      customerSettings={customerSettings ?? []}
      featureSettings={featureSettings ?? []}
    />
  );
}

function LoyaltySettingsForm({ customerSettings, featureSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();

  const [form, setForm] = useState(() => {
    const findCust = (key, fallback) =>
      customerSettings.find?.((s) => s.key === key)?.value ?? fallback;
    const findFeat = (key, fallback) =>
      featureSettings.find?.((s) => s.key === key)?.value ?? fallback;

    const earnSpendHalalas = findCust('loyalty.earnSpendRate', 10_000);
    const cardFeeHalalas = findCust('loyalty.cardIssuanceFee', 0);
    const pointValHalalas = findCust('loyalty.pointRedemptionValue', 100);

    return {
      enabled: Boolean(findFeat('features.loyalty', true)),
      earnSpendRate: (earnSpendHalalas / 100).toFixed(2),
      cardIssuanceFee: (cardFeeHalalas / 100).toFixed(2),
      pointRedemptionValue: (pointValHalalas / 100).toFixed(2),
      minRedeemPoints: findCust('loyalty.minRedeemPoints', 10),
      maxRedeemPointsPerOrder: findCust('loyalty.maxRedeemPointsPerOrder', 0),
      expiryDays: findCust('loyalty.expiryDays', 365),
    };
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const earnSpendRate = Math.max(100, Math.round((parseFloat(form.earnSpendRate) || 100) * 100));
    const cardIssuanceFee = Math.max(0, Math.round((parseFloat(form.cardIssuanceFee) || 0) * 100));
    const pointRedemptionValue = Math.max(
      1,
      Math.round((parseFloat(form.pointRedemptionValue) || 1) * 100),
    );
    const minRedeemPoints = Math.max(0, parseInt(form.minRedeemPoints, 10) || 0);
    const maxRedeemPointsPerOrder = Math.max(0, parseInt(form.maxRedeemPointsPerOrder, 10) || 0);
    const expiryDays = Math.max(0, parseInt(form.expiryDays, 10) || 0);

    save.mutate([
      { key: 'features.loyalty', value: form.enabled },
      { key: 'loyalty.earnSpendRate', value: earnSpendRate },
      { key: 'loyalty.cardIssuanceFee', value: cardIssuanceFee },
      { key: 'loyalty.pointRedemptionValue', value: pointRedemptionValue },
      { key: 'loyalty.minRedeemPoints', value: minRedeemPoints },
      { key: 'loyalty.maxRedeemPointsPerOrder', value: maxRedeemPointsPerOrder },
      { key: 'loyalty.expiryDays', value: expiryDays },
    ]);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {/* Overview & Program Activation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded bg-primary/10 text-primary">
              <Gift className="size-4" />
            </div>
            <div>
              <CardTitle>{t('settings.loyalty.title', 'Loyalty & Rewards Program')}</CardTitle>
              <CardDescription>
                {t(
                  'settings.loyalty.description',
                  'Configure points earn rate, membership card fees, and redemption rules.',
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Checkbox
            label={t('settings.loyalty.enableProgram', 'Enable customer loyalty point system')}
            description={t(
              'settings.loyalty.enableHint',
              'Allow customers to earn and redeem reward points online and at the POS counter.',
            )}
            checked={form.enabled}
            onChange={(checked) => setForm((s) => ({ ...s, enabled: checked }))}
          />
        </CardContent>
      </Card>

      {/* Point Earning & Card Issuance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded bg-amber-500/10 text-amber-600">
              <Coins className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {t('settings.loyalty.earnRulesTitle', 'Point Earning & Card Issuance')}
              </CardTitle>
              <CardDescription>
                {t(
                  'settings.loyalty.earnRulesDesc',
                  'Set the amount spent per point and loyalty card issuance fee.',
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Spend per 1 point */}
          <div className="space-y-1.5">
            <Label htmlFor="loyalty-earn-rate" className="text-xs font-semibold">
              {t('settings.loyalty.earnSpendRateLabel', 'Spend amount to give 1 point (SAR)')}
            </Label>
            <Input
              id="loyalty-earn-rate"
              type="number"
              step="0.01"
              min="1"
              value={form.earnSpendRate}
              onChange={(e) => setForm((s) => ({ ...s, earnSpendRate: e.target.value }))}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                'settings.loyalty.earnSpendRateHint',
                'E.g., 100.00 means 100 spent gives 1 loyalty point.',
              )}
            </p>
          </div>

          {/* Card Issuance Fee */}
          <div className="space-y-1.5">
            <Label htmlFor="loyalty-card-fee" className="text-xs font-semibold">
              {t('settings.loyalty.cardIssuanceFeeLabel', 'Loyalty card issuance fee (SAR)')}
            </Label>
            <Input
              id="loyalty-card-fee"
              type="number"
              step="0.01"
              min="0"
              value={form.cardIssuanceFee}
              onChange={(e) => setForm((s) => ({ ...s, cardIssuanceFee: e.target.value }))}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                'settings.loyalty.cardIssuanceFeeHint',
                'Fee charged to the customer when issuing a loyalty card (0 = free).',
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Point Redemption & Expiry */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded bg-emerald-500/10 text-emerald-600">
              <CreditCard className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {t('settings.loyalty.redemptionTitle', 'Point Redemption & Expiry')}
              </CardTitle>
              <CardDescription>
                {t(
                  'settings.loyalty.redemptionDesc',
                  'Control discount value of points and validity duration.',
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {/* 1 point value */}
          <div className="space-y-1.5">
            <Label htmlFor="loyalty-point-value" className="text-xs font-semibold">
              {t('settings.loyalty.pointValueLabel', 'Discount value per 1 point (SAR)')}
            </Label>
            <Input
              id="loyalty-point-value"
              type="number"
              step="0.01"
              min="0.01"
              value={form.pointRedemptionValue}
              onChange={(e) => setForm((s) => ({ ...s, pointRedemptionValue: e.target.value }))}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t('settings.loyalty.pointValueHint', '1.00 = 1 point redeems for 1 SAR discount.')}
            </p>
          </div>

          {/* Minimum Points to Redeem */}
          <div className="space-y-1.5">
            <Label htmlFor="loyalty-min-points" className="text-xs font-semibold">
              {t('settings.loyalty.minPointsLabel', 'Minimum points to redeem')}
            </Label>
            <Input
              id="loyalty-min-points"
              type="number"
              min="0"
              value={form.minRedeemPoints}
              onChange={(e) => setForm((s) => ({ ...s, minRedeemPoints: e.target.value }))}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t('settings.loyalty.minPointsHint', 'Minimum balance required to redeem points.')}
            </p>
          </div>

          {/* Expiry in Days */}
          <div className="space-y-1.5">
            <Label htmlFor="loyalty-expiry" className="text-xs font-semibold">
              {t('settings.loyalty.expiryDaysLabel', 'Points expiry (Days)')}
            </Label>
            <Input
              id="loyalty-expiry"
              type="number"
              min="0"
              value={form.expiryDays}
              onChange={(e) => setForm((s) => ({ ...s, expiryDays: e.target.value }))}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                'settings.loyalty.expiryDaysHint',
                'Days until earned points expire (0 = never expire).',
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending} className="gap-2 shadow-2xs">
          <Save className="size-4" />
          <span>
            {save.isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save Changes')}
          </span>
        </Button>
      </div>
    </form>
  );
}
