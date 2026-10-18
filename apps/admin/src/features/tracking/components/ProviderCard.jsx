import { Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TRACKING_EVENTS } from '@supershop/shared';

const EVENT_LIST = Object.values(TRACKING_EVENTS);

export function ProviderCard({ integration, onSave, isPending }) {
  const { t } = useTranslation();
  const provider = integration.provider;

  const [enabled, setEnabled] = useState(Boolean(integration.enabled));
  const [clientConfig, setClientConfig] = useState(integration.clientConfig || {});
  const [credentials, setCredentials] = useState(integration.credentials || {});
  const [events, setEvents] = useState(
    integration.events && integration.events.length > 0 ? integration.events : EVENT_LIST,
  );
  const [showSecret, setShowSecret] = useState(false);

  const handleConfigChange = (key, value) => {
    setClientConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleCredChange = (key, value) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const toggleEvent = (eventName) => {
    setEvents((prev) =>
      prev.includes(eventName) ? prev.filter((e) => e !== eventName) : [...prev, eventName],
    );
  };

  const selectAllEvents = () => setEvents(EVENT_LIST);
  const clearEvents = () => setEvents([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      provider,
      enabled,
      clientConfig,
      credentials,
      events,
    });
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {t(`tracking.providers.${provider}.name`)}
            <Badge variant={enabled ? 'success' : 'outline'} className="text-[10px]">
              {enabled ? t('tracking.status.active') : t('tracking.status.inactive')}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            {t(`tracking.providers.${provider}.desc`)}
          </CardDescription>
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

      <CardContent className="flex-1 flex flex-col justify-between pt-0 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider-specific fields */}
          {provider === 'gtm' && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="gtm-containerId" className="text-xs">
                  {t('tracking.fields.gtmContainerId')}
                </Label>
                <Input
                  id="gtm-containerId"
                  placeholder="GTM-XXXXXXX"
                  value={clientConfig.containerId || ''}
                  onChange={(e) => handleConfigChange('containerId', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gtm-serverUrl" className="text-xs">
                  {t('tracking.fields.gtmServerUrl')}
                </Label>
                <Input
                  id="gtm-serverUrl"
                  placeholder="https://sgtm.example.com"
                  value={clientConfig.serverUrl || ''}
                  onChange={(e) => handleConfigChange('serverUrl', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {provider === 'ga4' && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ga4-measurementId" className="text-xs">
                  {t('tracking.fields.ga4MeasurementId')}
                </Label>
                <Input
                  id="ga4-measurementId"
                  placeholder="G-XXXXXXXXXX"
                  value={clientConfig.measurementId || ''}
                  onChange={(e) => handleConfigChange('measurementId', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ga4-apiSecret" className="text-xs">
                  {t('tracking.fields.ga4ApiSecret')}
                </Label>
                <div className="relative">
                  <Input
                    id="ga4-apiSecret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="API Secret token"
                    value={credentials.apiSecret || ''}
                    onChange={(e) => handleCredChange('apiSecret', e.target.value)}
                    className="font-mono text-xs pe-8"
                  />
                  <button
                    type="button"
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSecret(!showSecret)}
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {provider === 'meta' && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="meta-pixelId" className="text-xs">
                  {t('tracking.fields.metaPixelId')}
                </Label>
                <Input
                  id="meta-pixelId"
                  placeholder="1234567890"
                  value={clientConfig.pixelId || ''}
                  onChange={(e) => handleConfigChange('pixelId', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meta-capiToken" className="text-xs">
                  {t('tracking.fields.metaCapiToken')}
                </Label>
                <div className="relative">
                  <Input
                    id="meta-capiToken"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="EAA..."
                    value={credentials.capiToken || ''}
                    onChange={(e) => handleCredChange('capiToken', e.target.value)}
                    className="font-mono text-xs pe-8"
                  />
                  <button
                    type="button"
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSecret(!showSecret)}
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meta-testEventCode" className="text-xs">
                  {t('tracking.fields.metaTestCode')}
                </Label>
                <Input
                  id="meta-testEventCode"
                  placeholder="TEST1234"
                  value={credentials.testEventCode || ''}
                  onChange={(e) => handleCredChange('testEventCode', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {provider === 'google_ads' && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="gads-conversionId" className="text-xs">
                  {t('tracking.fields.googleAdsConversionId')}
                </Label>
                <Input
                  id="gads-conversionId"
                  placeholder="AW-XXXXXXXXX"
                  value={clientConfig.conversionId || ''}
                  onChange={(e) => handleConfigChange('conversionId', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gads-conversionLabel" className="text-xs">
                  {t('tracking.fields.googleAdsConversionLabel')}
                </Label>
                <Input
                  id="gads-conversionLabel"
                  placeholder="AbCdEfGhIjKlMnOp"
                  value={clientConfig.conversionLabel || ''}
                  onChange={(e) => handleConfigChange('conversionLabel', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {provider === 'tiktok' && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tiktok-pixelId" className="text-xs">
                  {t('tracking.fields.tiktokPixelId')}
                </Label>
                <Input
                  id="tiktok-pixelId"
                  placeholder="CXXXXXXXXXXXXXXX"
                  value={clientConfig.pixelId || ''}
                  onChange={(e) => handleConfigChange('pixelId', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tiktok-accessToken" className="text-xs">
                  {t('tracking.fields.tiktokAccessToken')}
                </Label>
                <Input
                  id="tiktok-accessToken"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Access Token"
                  value={credentials.accessToken || ''}
                  onChange={(e) => handleCredChange('accessToken', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {provider === 'snapchat' && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="snap-pixelId" className="text-xs">
                  {t('tracking.fields.snapPixelId')}
                </Label>
                <Input
                  id="snap-pixelId"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={clientConfig.pixelId || ''}
                  onChange={(e) => handleConfigChange('pixelId', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="snap-apiToken" className="text-xs">
                  {t('tracking.fields.snapApiToken')}
                </Label>
                <Input
                  id="snap-apiToken"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="API Token"
                  value={credentials.apiToken || ''}
                  onChange={(e) => handleCredChange('apiToken', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Event Toggles Accordion / Checklist */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {t('tracking.events.title')} ({events.length}/{EVENT_LIST.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={selectAllEvents}
                >
                  {t('tracking.events.selectAll')}
                </button>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:underline"
                  onClick={clearEvents}
                >
                  {t('tracking.events.clear')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1.5 border rounded bg-muted/20">
              {EVENT_LIST.map((evt) => {
                const checked = events.includes(evt);
                return (
                  <label
                    key={evt}
                    className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer select-none truncate"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(evt)}
                      className="rounded border-border text-primary size-3.5"
                    />
                    <span
                      className={checked ? 'text-foreground font-medium' : 'text-muted-foreground'}
                    >
                      {evt}
                    </span>
                  </label>
                );
              })}
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
                  {t('tracking.actions.save')}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
