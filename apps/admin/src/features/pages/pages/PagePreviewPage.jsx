import { PERMISSIONS as P } from '@supershop/shared';
import { CORE_BLOCK_COMPONENTS, PagePreview } from '@supershop/ui';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { usePage, usePageAction } from '../resource';

/**
 * A page as a visitor would see it, in either language (P5.1). The same renderer the storefront
 * uses draws it, so this is a real preview and not an impression of one. P5.2 puts the builder's
 * canvas beside it; today it previews the draft and publishes it.
 */
export function PagePreviewPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const can = useCan();
  const { data: page, isPending, isError, error } = usePage(id);
  const action = usePageAction(id);

  if (isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  if (isPending) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link to="/pages" className="text-sm text-muted-foreground hover:underline">
            ← {t('cms.title')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {page.title?.en ?? page.slug}
            <Badge tone={page.status === 'published' ? 'ok' : 'muted'}>
              {t(`cms.status.${page.status}`)}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground" dir="ltr">
            /p/{page.slug}
          </p>
        </div>
        {can(P.PAGE_PUBLISH) && (
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={action.isPending}
              onClick={() => action.mutate('publish')}
            >
              {t('cms.publish')}
            </Button>
            {page.status === 'published' && (
              <Button
                type="button"
                variant="outline"
                disabled={action.isPending}
                onClick={() => action.mutate('unpublish')}
              >
                {t('cms.unpublish')}
              </Button>
            )}
          </div>
        )}
      </header>

      {page.draft.blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('cms.noBlocks')}
        </p>
      ) : (
        <PagePreview
          content={page.draft}
          texts={page.texts}
          components={CORE_BLOCK_COMPONENTS}
          label={t('cms.preview')}
          languages={[
            { code: 'en', label: t('cms.languages.en'), rtl: false },
            { code: 'ar', label: t('cms.languages.ar'), rtl: true },
          ]}
        />
      )}
    </div>
  );
}
