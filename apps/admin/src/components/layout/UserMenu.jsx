import { ChevronDown, LogOut, MonitorOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
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
import { TwoFactorModal } from '@/features/auth/components/TwoFactorModal';
import { useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function UserMenu({ variant = 'header' }) {
  const { t } = useTranslation();
  const [show2fa, setShow2fa] = useState(false);
  const profile = useAuthStore((s) => s.profile);
  const isSuperAdmin = useAuthStore((s) => s.access?.isSuperAdmin);
  const logout = useLogout();
  const logoutAll = useLogout({ everywhere: true });
  // Clearing the session makes <RequireAuth> redirect to /login (deliberate sign-out → no `next`).
  const leave = (m) => m.mutate();

  const roleLabel = isSuperAdmin ? t('user.superAdmin', 'Super Administrator') : 'Administrator';

  const trigger =
    variant === 'sidebar' ? (
      <button
        type="button"
        aria-label={t('nav.userProfile', 'User profile')}
        className="flex w-full items-center gap-3 rounded-xl p-2 text-start transition-colors hover:bg-white/5 outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
          {initials(profile?.name) || 'U'}
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate text-sm font-semibold text-white">
            {profile?.name || 'Administrator'}
          </span>
          <span className="truncate text-xs text-slate-400">{roleLabel}</span>
        </div>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
    ) : (
      <Button variant="ghost" className="h-9 gap-2 px-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(profile?.name)}
        </span>
        <span className="hidden text-sm font-medium sm:inline">{profile?.name}</span>
      </Button>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={variant === 'sidebar' ? 'start' : 'end'}
          side={variant === 'sidebar' ? 'top' : 'bottom'}
          className="w-56 mb-1"
        >
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
          <DropdownMenuItem onSelect={() => setShow2fa(true)}>
            <ShieldCheck aria-hidden="true" /> {t('auth.twoFactorSecurity')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => leave(logout)}>
            <LogOut aria-hidden="true" /> {t('auth.signOut')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => leave(logoutAll)}>
            <MonitorOff aria-hidden="true" /> {t('auth.signOutEverywhere')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TwoFactorModal open={show2fa} onOpenChange={setShow2fa} />
    </>
  );
}
