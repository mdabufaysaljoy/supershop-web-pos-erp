import { LogOut, MonitorOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function UserMenu() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const isSuperAdmin = useAuthStore((s) => s.access?.isSuperAdmin);
  const logout = useLogout();
  const logoutAll = useLogout({ everywhere: true });
  // Clearing the session makes <RequireAuth> redirect to /login (deliberate sign-out → no `next`).
  const leave = (m) => m.mutate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(profile?.name)}
          </span>
          <span className="hidden text-sm font-medium sm:inline">{profile?.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="grid gap-0.5">
          <span>{profile?.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{profile?.email}</span>
          {isSuperAdmin && (
            <span className="text-xs font-normal text-muted-foreground">
              {t('user.superAdmin')}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => leave(logout)}>
          <LogOut aria-hidden="true" /> {t('auth.signOut')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => leave(logoutAll)}>
          <MonitorOff aria-hidden="true" /> {t('auth.signOutEverywhere')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
