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
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                  'group flex items-center gap-3 rounded px-3.5 py-2.5 text-xs font-medium transition-all',
                  isActive
                    ? 'bg-primary font-semibold text-primary-foreground shadow-xs'
                    : 'text-slate-300/80 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'size-4 shrink-0 transition-colors',
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-slate-400 group-hover:text-white',
                    )}
                    aria-hidden="true"
                  />
                  <span>{t(label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
