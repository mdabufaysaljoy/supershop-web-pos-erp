import { PERMISSIONS } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/pages/PageHeader';
import { LanguagesTab } from './LanguagesTab';

/**
 * Settings with tabs (?tab=). Each tab maps to a settings group; more tabs (general, tax, checkout,
 * payments, printing…) are added by their feature tasks.
 */
const TABS = [
  {
    id: 'languages',
    label: 'settings.tabs.languages',
    perm: PERMISSIONS.SETTINGS_VIEW,
    Component: LanguagesTab,
  },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const active = TABS.find((tab) => tab.id === params.get('tab')) ?? TABS[0];
  const { Component } = active;
  return (
    <div className="grid gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <div role="tablist" aria-label={t('settings.title')} className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active.id}
            onClick={() => setParams({ tab: tab.id })}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium aria-selected:border-primary aria-[selected=false]:border-transparent aria-[selected=false]:text-muted-foreground"
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <Component />
      </div>
    </div>
  );
}
