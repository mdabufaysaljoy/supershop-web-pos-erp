import { PlainTextInput } from '@supershop/ui';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/i18n';
import { MediaDetailsDialog } from '../components/MediaDetailsDialog';
import { MediaGrid } from '../components/MediaGrid';
import { UploadDropzone } from '../components/UploadDropzone';
import { useMediaList } from '../hooks';

const PAGE_SIZE = 40;

/** Media library: upload, browse/search, edit alt text, delete. State lives in the URL (?q&page). */
export function MediaLibraryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const [openId, setOpenId] = useState(null);

  const { data, isPending, isError, error } = useMediaList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
  });
  const items = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = items.find((m) => m.id === openId) ?? null;

  const go = (next) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === '' || v === 1 || v == null) p.delete(k);
      else p.set(k, String(v));
    }
    setParams(p);
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('media.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('media.description')}</p>
      </header>

      <UploadDropzone />

      <form
        role="search"
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: search.trim(), page: 1 });
        }}
      >
        <PlainTextInput
          type="search"
          value={search}
          maxLength={100}
          aria-label={t('media.search')}
          placeholder={t('media.search')}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="outline" size="icon" aria-label={t('media.search')}>
          <Search className="size-4" aria-hidden />
        </Button>
      </form>

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      <MediaGrid items={items} loading={isPending} onOpen={setOpenId} />

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label={t('media.pagination')}>
          <Button variant="outline" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
            {t('media.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('media.pageOf', { page, pages })}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => go({ page: page + 1 })}>
            {t('media.next')}
          </Button>
        </nav>
      )}

      <MediaDetailsDialog media={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}
