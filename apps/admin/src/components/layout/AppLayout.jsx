import { Menu, Store } from 'lucide-react';
import { themeCssVars } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { HelpDrawer } from '@/components/help/HelpDrawer';
import { useAccessSync } from '@/features/auth/hooks';
import { useLayout } from '@/features/site/resource';
import { SidebarNav } from './SidebarNav';
import { UserMenu } from './UserMenu';

/** Signed-in shell: sidebar (desktop) / sheet (mobile), top bar, page outlet. */
export function AppLayout() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const layout = useLayout();
  useAccessSync();

  const themeVars = layout.data?.theme ? themeCssVars(layout.data.theme) : undefined;
  const storeName = layout.data?.brand?.name || t('app.name');

  const brand = (
    <Link
      to="/"
      className="flex items-center gap-3 px-4 py-3.5 transition-opacity hover:opacity-90"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Store className="size-5" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="truncate text-sm font-bold text-white leading-tight">{storeName}</span>
        <span className="truncate text-xs text-slate-400 leading-tight">
          {`${storeName} - Main`}
        </span>
      </div>
    </Link>
  );

  return (
    <div className="flex min-h-svh bg-background" style={themeVars}>
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-e border-slate-800/80 bg-sidebar lg:flex">
        <div className="border-b border-slate-800/60">{brand}</div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t border-slate-800/80 p-3">
          <UserMenu variant="sidebar" />
        </div>
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
            <SheetContent
              closeLabel={t('nav.closeMenu')}
              className="bg-sidebar text-sidebar-foreground border-slate-800 flex flex-col p-0"
            >
              <SheetTitle className="sr-only">{storeName}</SheetTitle>
              <div className="border-b border-slate-800/60">{brand}</div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t border-slate-800/80 p-3">
                <UserMenu variant="sidebar" />
              </div>
            </SheetContent>
          </Sheet>
          <div className="ms-auto flex items-center gap-2">
            <HelpDrawer />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 bg-[#f4f6f8]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
