import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAccessSync } from '@/features/auth/hooks';
import { SidebarNav } from './SidebarNav';
import { UserMenu } from './UserMenu';

/** Signed-in shell: sidebar (desktop) / sheet (mobile), top bar, page outlet. */
export function AppLayout() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useAccessSync();

  const brand = (
    <Link to="/" className="flex h-14 items-center px-5 text-base font-semibold">
      {t('app.name')}
    </Link>
  );

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col overflow-y-auto border-e bg-sidebar lg:flex">
        {brand}
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={t('nav.openMenu')}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent closeLabel={t('nav.closeMenu')}>
              <SheetTitle>{t('app.name')}</SheetTitle>
              {brand}
              <div className="overflow-y-auto">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="ms-auto">
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
