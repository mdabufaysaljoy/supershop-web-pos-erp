import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { errorMessage } from '@/lib/i18n';
import { useListParams } from '@/lib/useListParams';
import { MediaDetailsDialog } from '../components/MediaDetailsDialog';
import { MediaGrid } from '../components/MediaGrid';
import { UploadDropzone } from '../components/UploadDropzone';
import { useMediaList } from '../hooks';

const PAGE_SIZE = 40;

/** Media library: upload, browse/search, edit alt text, delete. State lives in the URL (?q&page). */
export function MediaLibraryPage() {
  const { t } = useTranslation();
  const { page, q, go } = useListParams(useSearchParams());
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

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('media.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('media.description')}</p>
      </header>

      <UploadDropzone />

      <SearchForm initial={q} label={t('media.search')} onSearch={(v) => go({ q: v, page: 1 })} />

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      <MediaGrid items={items} loading={isPending} onOpen={setOpenId} />

      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />

      <MediaDetailsDialog media={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}
