import { PERMISSIONS as P } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { AnnouncementCard } from '../components/AnnouncementCard';
import { BrandCard } from '../components/BrandCard';
import { ChromeCard } from '../components/ChromeCard';
import { ContactCard } from '../components/ContactCard';
import { FeaturesManagerCard } from '../components/FeaturesManagerCard';
import { HeroSliderCard } from '../components/HeroSliderCard';
import { MenusCard } from '../components/MenusCard';
import { RedirectsCard } from '../components/RedirectsCard';
import { SeoCard } from '../components/SeoCard';
import { ThemeCard } from '../components/ThemeCard';
import { useLayout, useMenus } from '../resource';

/**
 * Appearance (P5.4/P5.5), in five tabs: what wraps the pages, the flagship hero slider,
 * why shop with us selling points, what the shop says about itself, and the addresses that have moved.
 * Everything here is data — nothing needs a deploy.
 */
const TABS = [
  { id: 'chrome', label: 'appearance.tabs.chrome' },
  { id: 'slider', label: 'appearance.tabs.slider' },
  { id: 'features', label: 'appearance.tabs.features' },
  { id: 'site', label: 'appearance.tabs.site' },
  { id: 'redirects', label: 'appearance.tabs.redirects' },
];

export function AppearancePage() {
  const { t } = useTranslation();
  const can = useCan();
  const canEditChrome = can(P.MENU_MANAGE);
  const canEditSeo = can(P.SEO_MANAGE);
  const [params, setParams] = useSearchParams();
  const active = TABS.find((tab) => tab.id === params.get('tab')) ?? TABS[0];
  const layout = useLayout();
  const menus = useMenus();

  if (layout.isError || menus.isError)
    return <Alert variant="destructive">{errorMessage(t, layout.error ?? menus.error)}</Alert>;
  if (layout.isPending || menus.isPending) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('appearance.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('appearance.description')}</p>
      </header>

      <div role="tablist" aria-label={t('appearance.title')} className="flex gap-1 border-b">
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

      <div role="tabpanel" className="grid gap-6">
        {active.id === 'chrome' && (
          <>
            <AnnouncementCard layout={layout.data} disabled={!canEditChrome} />
            <MenusCard menus={menus.data} disabled={!canEditChrome} />
            <ChromeCard layout={layout.data} menus={menus.data} disabled={!canEditChrome} />
            <ThemeCard layout={layout.data} disabled={!canEditChrome} />
          </>
        )}
        {active.id === 'slider' && <HeroSliderCard disabled={!canEditChrome} />}
        {active.id === 'features' && <FeaturesManagerCard disabled={!canEditChrome} />}
        {active.id === 'site' && (
          <>
            <BrandCard layout={layout.data} disabled={!canEditChrome} />
            <ContactCard layout={layout.data} disabled={!canEditChrome} />
            <SeoCard layout={layout.data} disabled={!canEditChrome} />
          </>
        )}
        {active.id === 'redirects' && <RedirectsCard disabled={!canEditSeo} />}
      </div>
    </div>
  );
}
