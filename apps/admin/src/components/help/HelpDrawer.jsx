import {
  Barcode,
  BookOpen,
  FileSpreadsheet,
  HelpCircle,
  Keyboard,
  Languages,
  Package,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const TOPIC_KEYS = [
  { id: 'pos', icon: ShoppingBag, path: '/pos' },
  { id: 'shifts', icon: Receipt, path: '/shifts' },
  { id: 'returns', icon: RotateCcw, path: '/returns' },
  { id: 'orders', icon: Package, path: '/orders' },
  { id: 'inventory', icon: Package, path: '/inventory' },
  { id: 'barcodes', icon: Barcode, path: '/products' },
  { id: 'translations', icon: Languages, path: '/settings?tab=languages' },
  { id: 'exports', icon: FileSpreadsheet, path: '/reports' },
];

const SHORTCUT_DEFS = [
  { key: 'F2', labelKey: 'help.shortcuts.f2' },
  { key: 'F4', labelKey: 'help.shortcuts.f4' },
  { key: 'Enter', labelKey: 'help.shortcuts.enter' },
  { key: 'Esc', labelKey: 'help.shortcuts.esc' },
  { key: 'Scanner', labelKey: 'help.shortcuts.scanner' },
  { key: 'Ctrl+P', labelKey: 'help.shortcuts.ctrlP' },
];

/** In-app staff help drawer with searchable operational guides and keyboard cheatsheet. */
export function HelpDrawer() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const topics = useMemo(() => {
    return TOPIC_KEYS.map(({ id, icon: Icon, path }) => ({
      id,
      icon: Icon,
      path,
      badge: t(`help.topics.${id}.badge`),
      title: t(`help.topics.${id}.title`),
      description: t(`help.topics.${id}.description`),
      points: [
        t(`help.topics.${id}.p1`),
        t(`help.topics.${id}.p2`),
        t(`help.topics.${id}.p3`),
        id === 'shifts' || id === 'returns' ? t(`help.topics.${id}.p4`) : null,
      ].filter(Boolean),
    }));
  }, [t]);

  const shortcuts = useMemo(() => {
    return SHORTCUT_DEFS.map(({ key, labelKey }) => ({
      key,
      action: t(labelKey),
    }));
  }, [t]);

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics.filter((topic) => {
      if (activeFilter !== 'all' && topic.id !== activeFilter) {
        return false;
      }
      if (!q) return true;

      const titleMatch = topic.title.toLowerCase().includes(q);
      const descMatch = topic.description.toLowerCase().includes(q);
      const badgeMatch = topic.badge.toLowerCase().includes(q);
      const pointsMatch = topic.points.some((p) => p.toLowerCase().includes(q));

      return titleMatch || descMatch || badgeMatch || pointsMatch;
    });
  }, [topics, query, activeFilter]);

  const filteredShortcuts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter(
      (s) => s.key.toLowerCase().includes(q) || s.action.toLowerCase().includes(q),
    );
  }, [shortcuts, query]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('help.buttonLabel')}
          title={t('help.title')}
          className="text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="end"
        closeLabel={t('help.closeHelp')}
        className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl flex flex-col p-0 bg-background"
      >
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="size-5" />
          </div>
          <div>
            <SheetTitle className="text-base font-semibold leading-tight">
              {t('help.title')}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {t('help.description')}
            </SheetDescription>
          </div>
        </div>

        <div className="border-b px-6 py-3 bg-muted/20 space-y-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('help.searchPlaceholder')}
              className="ps-9 pe-9 h-9 text-sm"
              aria-label={t('help.searchPlaceholder')}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('help.clearSearch')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button
              variant={activeFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setActiveFilter('all')}
            >
              {t('help.allTopics')}
            </Button>
            {topics.map((tItem) => (
              <Button
                key={tItem.id}
                variant={activeFilter === tItem.id ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setActiveFilter(tItem.id)}
              >
                {tItem.badge}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {(activeFilter === 'all' || activeFilter === 'pos') && filteredShortcuts.length > 0 && (
            <div className="space-y-3 rounded-lg border p-4 bg-card shadow-sm">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Keyboard className="size-4 text-primary" />
                <span>{t('help.topics.pos.title')}</span>
              </div>
              <div className="overflow-hidden rounded-md border text-xs">
                <table className="w-full text-start">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="py-1.5 px-3 font-semibold text-start w-28">
                        {t('help.shortcutColKey')}
                      </th>
                      <th className="py-1.5 px-3 font-semibold text-start">
                        {t('help.shortcutColAction')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredShortcuts.map((s) => (
                      <tr key={s.key} className="hover:bg-muted/20">
                        <td className="py-1.5 px-3 font-mono font-medium">
                          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px] shadow-sm">
                            {s.key}
                          </kbd>
                        </td>
                        <td className="py-1.5 px-3 text-muted-foreground">{s.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredTopics.length === 0 && filteredShortcuts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('help.noResults')}
            </div>
          ) : (
            filteredTopics.map((topic) => {
              const Icon = topic.icon;
              return (
                <div
                  key={topic.id}
                  className="rounded-lg border p-4 bg-card space-y-2.5 shadow-sm hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                      <h4 className="font-semibold text-sm leading-none">{topic.title}</h4>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {topic.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {topic.description}
                  </p>
                  <ul className="space-y-1.5 pt-1 text-xs text-foreground/90">
                    {topic.points.map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-primary font-bold">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2 flex justify-end">
                    <Link
                      to={topic.path}
                      onClick={() => setOpen(false)}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {t('help.quickLinks')} →
                    </Link>
                  </div>
                </div>
              );
            })
          )}

          <div className="rounded-lg border border-dashed p-4 text-xs space-y-1.5 bg-muted/10">
            <div className="font-medium flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <span>{t('help.openUserGuide')}</span>
            </div>
            <p className="text-muted-foreground">{t('help.userGuideNote')}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
