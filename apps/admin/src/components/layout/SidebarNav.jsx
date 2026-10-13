import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { filterNav, NAV } from './navigation';

/** Permission-filtered menu. `onNavigate` closes the mobile sheet. */
export function SidebarNav({ onNavigate }) {
  const { t } = useTranslation();
  const sections = filterNav(NAV, useCan());
  return (
    <nav aria-label={t('app.name')} className="flex flex-col gap-5 px-3 py-4">
      {sections.map((section) => (
        <div key={section.section} className="grid gap-1">
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(section.section)}
          </p>
          {section.items.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  isActive && 'bg-sidebar-accent text-sidebar-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t(label)}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
