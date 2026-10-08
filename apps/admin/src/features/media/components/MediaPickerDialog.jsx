import { PlainTextInput } from '@supershop/ui';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useMediaList } from '../hooks';
import { MediaGrid } from './MediaGrid';
import { UploadDropzone } from './UploadDropzone';

const PAGE_SIZE = 24;

/**
 * Pick one image from the library (or upload one first). Reused by every editor that needs an
 * image (categories, products, page blocks). `onSelect(media)` receives the media DTO.
 */
export function MediaPickerDialog({ open, onOpenChange, onSelect }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} className="max-w-4xl">
        <div className="grid gap-1 pe-8">
          <DialogTitle>{t('media.picker.title')}</DialogTitle>
          <DialogDescription>{t('media.picker.description')}</DialogDescription>
        </div>
        {open && <PickerBody onSelect={onSelect} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onSelect }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isPending } = useMediaList({ page, limit: PAGE_SIZE, ...(q && { q }) });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <UploadDropzone />
      <form
        role="search"
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
          setPage(1);
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
      <MediaGrid
        items={items}
        loading={isPending}
        onOpen={(id) => onSelect(items.find((m) => m.id === id))}
      />
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label={t('media.pagination')}>
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('media.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('media.pageOf', { page, pages })}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {t('media.next')}
          </Button>
        </nav>
      )}
    </div>
  );
}
