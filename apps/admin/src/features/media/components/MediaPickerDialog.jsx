import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { SearchForm } from '@/components/SearchForm';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useMediaList } from '../hooks';
import { MediaGrid } from './MediaGrid';
import { UploadDropzone } from './UploadDropzone';

const PAGE_SIZE = 24;

/**
 * Pick images from the library (or upload first). Reused by every editor that needs images
 * (categories, brands, products, page blocks). `onSelect(media)` receives the media DTO.
 * With `selectedIds` (multi-pick, e.g. a gallery) the dialog stays open and shows what is chosen;
 * clicking toggles via `onSelect`.
 */
export function MediaPickerDialog({ open, onOpenChange, onSelect, selectedIds }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} className="max-w-4xl">
        <div className="grid gap-1 pe-8">
          <DialogTitle>{t('media.picker.title')}</DialogTitle>
          <DialogDescription>{t('media.picker.description')}</DialogDescription>
        </div>
        {open && (
          <PickerBody
            onSelect={onSelect}
            selectedIds={selectedIds}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onSelect, selectedIds, onDone }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isPending } = useMediaList({ page, limit: PAGE_SIZE, ...(q && { q }) });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <UploadDropzone />
      <SearchForm
        label={t('media.search')}
        onSearch={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      <MediaGrid
        items={items}
        loading={isPending}
        selectedIds={selectedIds}
        onOpen={(id) => onSelect(items.find((m) => m.id === id))}
      />
      <Pagination page={page} pages={pages} onPage={setPage} />
      {selectedIds && (
        <div className="flex justify-end">
          <Button type="button" onClick={onDone}>
            {t('common.done')}
          </Button>
        </div>
      )}
    </div>
  );
}
