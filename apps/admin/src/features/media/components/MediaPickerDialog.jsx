import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
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
        onOpen={(id) => onSelect(items.find((m) => m.id === id))}
      />
      <Pagination page={page} pages={pages} onPage={setPage} />
    </div>
  );
}
