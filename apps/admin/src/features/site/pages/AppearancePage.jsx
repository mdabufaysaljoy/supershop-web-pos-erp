import { PERMISSIONS as P } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { AnnouncementCard } from '../components/AnnouncementCard';
import { ChromeCard } from '../components/ChromeCard';
import { MenusCard } from '../components/MenusCard';
import { ThemeCard } from '../components/ThemeCard';
import { useLayout, useMenus } from '../resource';

/**
 * Appearance (P5.4): the announcement bar, the menus in the header and footer, and the shop's
 * colours — everything about the site's chrome that is not a page.
 */
export function AppearancePage() {
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can(P.MENU_MANAGE);
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

      <AnnouncementCard layout={layout.data} disabled={!canEdit} />
      <MenusCard menus={menus.data} disabled={!canEdit} />
      <ChromeCard layout={layout.data} menus={menus.data} disabled={!canEdit} />
      <ThemeCard layout={layout.data} disabled={!canEdit} />
    </div>
  );
}
