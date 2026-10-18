import { Activity, History, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useTrackingIntegrations,
  useUpdateConsentSettings,
  useUpdateTrackingIntegration,
} from '../resource';
import { ConsentBannerCard } from '../components/ConsentBannerCard';
import { EventLogsTab } from '../components/EventLogsTab';
import { ProviderCard } from '../components/ProviderCard';

export function TrackingPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('integrations'); // 'integrations' | 'consent' | 'logs'

  const { data, isLoading } = useTrackingIntegrations();
  const updateIntegration = useUpdateTrackingIntegration();
  const updateConsent = useUpdateConsentSettings();

  const integrations = data?.integrations || [];
  const consent = data?.consent || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="size-6 text-primary" aria-hidden />
          {t('tracking.title')}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">{t('tracking.description')}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-medium">
        <button
          type="button"
          className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'integrations'
              ? 'border-primary text-foreground font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('integrations')}
        >
          <Activity className="size-4" aria-hidden />
          {t('tracking.tabs.integrations')}
        </button>
        <button
          type="button"
          className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'consent'
              ? 'border-primary text-foreground font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('consent')}
        >
          <ShieldCheck className="size-4" aria-hidden />
          {t('tracking.tabs.consent')}
        </button>
        <button
          type="button"
          className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-primary text-foreground font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('logs')}
        >
          <History className="size-4" aria-hidden />
          {t('tracking.tabs.logs')}
        </button>
      </div>

      {activeTab === 'logs' ? (
        <EventLogsTab />
      ) : isLoading ? (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin me-2" aria-hidden />
          {t('common.loading')}
        </div>
      ) : activeTab === 'integrations' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration) => (
            <ProviderCard
              key={integration.provider}
              integration={integration}
              onSave={updateIntegration.mutate}
              isPending={updateIntegration.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-3xl">
          <ConsentBannerCard
            consent={consent}
            onSave={updateConsent.mutate}
            isPending={updateConsent.isPending}
          />
        </div>
      )}
    </div>
  );
}
