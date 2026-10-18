import { Loader2, Lock, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ConsentBannerCard({ consent = {}, onSave, isPending }) {
  const { t } = useTranslation();

  const [enabled, setEnabled] = useState(consent.enabled !== false);
  const [consentModeV2, setConsentModeV2] = useState(consent.consentModeV2 !== false);
  const [defaultAnalytics, setDefaultAnalytics] = useState(Boolean(consent.defaultAnalytics));
  const [defaultMarketing, setDefaultMarketing] = useState(Boolean(consent.defaultMarketing));
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState(consent.privacyPolicyUrl || '/privacy');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      enabled,
      consentModeV2,
      defaultAnalytics,
      defaultMarketing,
      privacyPolicyUrl: privacyPolicyUrl.trim() || '/privacy',
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            {t('tracking.consent.title')}
            <Badge variant={enabled ? 'success' : 'outline'} className="text-[10px]">
              {enabled ? t('tracking.status.active') : t('tracking.status.inactive')}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs mt-1">{t('tracking.consent.desc')}</CardDescription>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Google Consent Mode v2 */}
            <div className="flex items-start justify-between p-3 rounded-lg border bg-card">
              <div className="space-y-0.5 me-4">
                <Label className="text-xs font-semibold">
                  {t('tracking.consent.consentModeV2')}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t('tracking.consent.consentModeV2Desc')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={consentModeV2}
                onChange={(e) => setConsentModeV2(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary size-4"
              />
            </div>

            {/* Privacy Policy Link */}
            <div className="flex flex-col justify-between p-3 rounded-lg border bg-card">
              <div className="space-y-1">
                <Label htmlFor="privacy-url" className="text-xs font-semibold">
                  {t('tracking.consent.privacyPolicyUrl')}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t('tracking.consent.privacyPolicyUrlDesc')}
                </p>
              </div>
              <Input
                id="privacy-url"
                value={privacyPolicyUrl}
                onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
                placeholder="/privacy"
                className="text-xs mt-2"
              />
            </div>
          </div>

          {/* Categories defaults */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('tracking.consent.categoriesTitle')}
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Necessary (Locked) */}
              <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Lock className="size-3 text-muted-foreground" />
                    {t('tracking.consent.catNecessary')}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('tracking.consent.catNecessaryDesc')}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {t('tracking.consent.alwaysActive')}
                </Badge>
              </div>

              {/* Analytics */}
              <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">{t('tracking.consent.catAnalytics')}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('tracking.consent.catAnalyticsDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={defaultAnalytics}
                    onChange={(e) => setDefaultAnalytics(e.target.checked)}
                  />
                  <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Marketing */}
              <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">{t('tracking.consent.catMarketing')}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('tracking.consent.catMarketingDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={defaultMarketing}
                    onChange={(e) => setDefaultMarketing(e.target.checked)}
                  />
                  <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 me-1.5 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Save className="size-3.5 me-1.5" />
                  {t('tracking.actions.saveConsent')}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
