import { PERMISSIONS } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/permissions';
import { GlossaryCard } from '../components/GlossaryCard';
import { ProviderCard } from '../components/ProviderCard';
import { QueueCard } from '../components/QueueCard';
import { StorefrontOptionsCard } from '../components/StorefrontOptionsCard';
import { UiStringsCard } from '../components/UiStringsCard';
import { useI18nOverview, useLanguageSettings } from '../hooks';

/** Settings → Languages (CLAUDE.md §5.7, P0.13). Read with settings.view; change with settings.languages. */
export function LanguagesTab() {
  const { t } = useTranslation();
  const canEdit = useCan()(PERMISSIONS.SETTINGS_LANGUAGES);
  const settings = useLanguageSettings();
  const overview = useI18nOverview();

  if (settings.isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="grid gap-6">
      {!canEdit && <p className="text-sm text-muted-foreground">{t('settings.readOnly')}</p>}
      <ProviderCard settings={settings.data} overview={overview.data} canEdit={canEdit} />
      <StorefrontOptionsCard settings={settings.data} canEdit={canEdit} />
      <GlossaryCard canEdit={canEdit} />
      <UiStringsCard canEdit={canEdit} />
      <QueueCard overview={overview.data} canEdit={canEdit} />
    </div>
  );
}
