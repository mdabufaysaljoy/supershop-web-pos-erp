import { PERMISSIONS as P } from '@supershop/shared';
import { Monitor, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { PageSettingsDialog } from '../components/PageSettingsDialog';
import { BlockPalette } from '../builder/BlockPalette';
import { BuilderCanvas } from '../builder/BuilderCanvas';
import { PropsPanel } from '../builder/PropsPanel';
import { useAutosave } from '../builder/useAutosave';
import { useBuilder } from '../builder/useBuilder';
import { usePage, usePageAction, useSaveDraft } from '../resource';

const WIDTHS = [
  { id: 'desktop', icon: Monitor },
  { id: 'tablet', icon: Tablet },
  { id: 'mobile', icon: Smartphone },
];

/**
 * The page builder (P5.2). Blocks on the left, the page in the middle, the selected block's props
 * on the right. The canvas draws with the storefront's own renderer, the props panel is generated
 * from the registry, and the draft saves itself a moment after the editor stops.
 */
export function PageBuilderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data: page, isPending, isError, error } = usePage(id);
  if (isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  if (isPending) return <Skeleton className="h-96" />;
  // Keyed by id: opening another page starts its own history, never the previous page's.
  return <Builder key={page.id} page={page} />;
}

function Builder({ page }) {
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can(P.PAGE_MANAGE);
  const builder = useBuilder(page.draft);
  const saveDraft = useSaveDraft(page.id);
  const action = usePageAction(page.id);
  const [width, setWidth] = useState('desktop');
  const [lang, setLang] = useState('en');

  const save = useCallback((content) => saveDraft.mutateAsync({ draft: content }), [saveDraft]);
  const { status, saveNow } = useAutosave({ value: builder.content, save, enabled: canEdit });

  // The Arabic shown on the canvas is whatever has been translated SO FAR of what is saved.
  const texts = useMemo(() => page.texts ?? [], [page.texts]);

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <Link to="/pages" className="text-sm text-muted-foreground hover:underline">
            ← {t('cms.title')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {page.title?.en ?? page.slug}
            <Badge tone={page.status === 'published' ? 'ok' : 'muted'}>
              {t(`cms.status.${page.status}`)}
            </Badge>
            <span className="text-xs font-normal text-muted-foreground">
              {t(`cms.builder.save.${status}`)}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('cms.builder.history')} className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('cms.builder.undo')}
              disabled={!builder.canUndo || !canEdit}
              onClick={builder.undo}
            >
              <Undo2 className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('cms.builder.redo')}
              disabled={!builder.canRedo || !canEdit}
              onClick={builder.redo}
            >
              <Redo2 className="size-4" aria-hidden />
            </Button>
          </div>

          <div role="group" aria-label={t('cms.builder.width')} className="flex gap-1">
            {WIDTHS.map(({ id, icon: Icon }) => (
              <Button
                key={id}
                type="button"
                variant={width === id ? 'default' : 'outline'}
                size="icon"
                aria-label={t(`cms.builder.widths.${id}`)}
                aria-pressed={width === id}
                onClick={() => setWidth(id)}
              >
                <Icon className="size-4" aria-hidden />
              </Button>
            ))}
          </div>

          <div role="group" aria-label={t('cms.preview')} className="flex gap-1">
            {['en', 'ar'].map((code) => (
              <Button
                key={code}
                type="button"
                variant={lang === code ? 'default' : 'outline'}
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
              >
                {t(`cms.languages.${code}`)}
              </Button>
            ))}
          </div>

          <PageSettingsDialog page={page} disabled={!canEdit} />

          {canEdit && (
            <Button type="button" variant="outline" onClick={saveNow}>
              {t('common.save')}
            </Button>
          )}
          {can(P.PAGE_PUBLISH) && (
            <Button
              type="button"
              disabled={action.isPending}
              onClick={async () => {
                await saveNow(); // never publish something the editor cannot see saved
                action.mutate('publish');
              }}
            >
              {t('cms.publish')}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[14rem_1fr_18rem] lg:items-start">
        <aside className="rounded-xl border p-4 lg:sticky lg:top-4">
          <BlockPalette onAdd={(type) => builder.add(type)} disabled={!canEdit} />
        </aside>

        <section
          aria-label={t('cms.builder.canvas')}
          className="min-h-[24rem] rounded-xl border bg-muted/30 p-4"
        >
          <BuilderCanvas
            content={builder.content}
            texts={texts}
            lang={lang}
            width={width}
            selectedId={builder.selectedId}
            onSelect={builder.select}
            onMove={builder.move}
            onRemove={builder.remove}
            onDuplicate={builder.duplicate}
          />
        </section>

        <aside
          aria-label={t('cms.builder.properties')}
          className="rounded-xl border p-4 lg:sticky lg:top-4"
        >
          <PropsPanel
            block={builder.selected}
            texts={texts}
            disabled={!canEdit}
            onChange={(name, value) => builder.setProp(builder.selectedId, name, value)}
          />
        </aside>
      </div>

      {page.versions.length > 0 && (
        <section aria-label={t('cms.versions.title')} className="rounded-xl border p-4">
          <h2 className="mb-2 text-sm font-medium">{t('cms.versions.title')}</h2>
          <ul className="grid gap-2 text-sm">
            {page.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-3">
                <span>{fmt.dateTime(version.at)}</span>
                <span className="text-muted-foreground">
                  {t('cms.versions.blocks', { count: version.blockCount })}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() =>
                      action.mutate(`versions/${version.id}/restore`, {
                        onSuccess: (restored) => builder.replace(restored.draft),
                      })
                    }
                  >
                    {t('cms.versions.restore')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
