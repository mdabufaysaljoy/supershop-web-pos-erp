import { Bell, PackageX, Receipt, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/features/auth/store';
import { fmt } from '@/lib/format';
import { useAlerts, useMarkAlertsRead } from '../resource';

/** A picture for each kind of notice; anything unknown gets the bell itself. */
const ICONS = { 'order.online': ShoppingBag, 'stock.out': PackageX, 'return.created': Receipt };

/**
 * The bell in the top bar: what the shop has been told lately, with a dot while any of it is
 * unread. A notice that points somewhere is a link — clicking it goes there and marks it read;
 * one that points nowhere is just read.
 *
 * A notice that arrives while the admin is open also raises a toast, so a sale on the website is
 * noticed at the counter without anyone watching the bell.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const { data } = useAlerts({ enabled: signedIn });
  const markRead = useMarkAlertsRead();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const unread = data?.unread ?? 0;

  /** Everything seen so far, so only what is NEW raises a toast — never the backlog on sign-in. */
  const announced = useRef(null);
  useEffect(() => {
    if (!items.length) return;
    if (announced.current === null) {
      announced.current = new Set(items.map((a) => a.id));
      return;
    }
    for (const alert of [...items].reverse()) {
      if (announced.current.has(alert.id)) continue;
      announced.current.add(alert.id);
      if (alert.read) continue;
      toast(alert.title, {
        description: alert.body || undefined,
        action: alert.link
          ? { label: t('alerts.open', 'Open'), onClick: () => navigate(alert.link) }
          : undefined,
      });
    }
  }, [items, navigate, t]);

  const openAlert = (alert) => {
    markRead.mutate([alert.id]);
    setOpen(false);
    if (alert.link) navigate(alert.link);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0
              ? t('alerts.withUnread', { count: unread })
              : t('alerts.title', 'Notifications')
          }
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute end-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background"
            />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{t('alerts.title', 'Notifications')}</span>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => markRead.mutate(undefined)}
            >
              {t('alerts.markAllRead')}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('alerts.empty')}</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y">
            {items.map((alert) => {
              const Icon = ICONS[alert.type] ?? Bell;
              const row = (
                <span className="flex w-full items-start gap-2.5 px-3 py-2.5 text-start">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{alert.title}</span>
                      {!alert.read && (
                        <span
                          aria-label={t('alerts.unread', 'Unread')}
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </span>
                    {alert.body && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {alert.body}
                      </span>
                    )}
                    <span className="block text-[11px] text-muted-foreground">
                      {fmt.dateTime(alert.at, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </span>
                </span>
              );
              return (
                <li key={alert.id} className={alert.read ? '' : 'bg-primary/5'}>
                  {alert.link ? (
                    <button
                      type="button"
                      className="block w-full hover:bg-muted/60"
                      onClick={() => openAlert(alert)}
                    >
                      {row}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="block w-full cursor-default"
                      onClick={() => markRead.mutate([alert.id])}
                    >
                      {row}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
