import { MEDIA } from '@supershop/shared';
import { CheckCircle2, Copy, ImageUp, Loader2, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUploadQueue } from '../hooks';

const STATUS_ICON = {
  queued: Loader2,
  uploading: Loader2,
  done: CheckCircle2,
  duplicate: Copy,
  error: XCircle,
};

/**
 * Drop zone + file picker. Files upload one by one; each shows its own result. The server decides
 * what is an image (magic bytes) — `accept` only filters the picker.
 */
export function UploadDropzone() {
  const { t } = useTranslation();
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState([]);
  const queue = useUploadQueue();

  const start = (fileList) => {
    const files = [...(fileList ?? [])];
    if (!files.length || queue.isPending) return;
    setItems(
      files.map((f, i) => ({ key: `${f.name}-${f.size}-${i}`, name: f.name, status: 'queued' })),
    );
    queue.mutate({
      files,
      onItem: (index, patch) =>
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it))),
    });
  };

  return (
    <section className="grid gap-3" aria-label={t('media.upload.title')}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          start(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          dragging ? 'border-primary bg-muted' : 'border-border',
        )}
      >
        <ImageUp className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm">{t('media.upload.drop')}</p>
        <Button type="button" disabled={queue.isPending} onClick={() => input.current?.click()}>
          {queue.isPending ? t('media.upload.uploading') : t('media.upload.choose')}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={MEDIA.ACCEPT.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="media-file-input"
          onChange={(e) => {
            start(e.target.files);
            e.target.value = ''; // allow choosing the same file again
          }}
        />
        <p className="text-xs text-muted-foreground">{t('media.upload.hint')}</p>
      </div>

      {items.length > 0 && (
        <ul className="grid gap-1 text-sm" aria-live="polite">
          {items.map((it) => {
            const Icon = STATUS_ICON[it.status];
            return (
              <li key={it.key} className="flex items-start gap-2">
                <Icon
                  aria-hidden
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    (it.status === 'uploading' || it.status === 'queued') && 'animate-spin',
                    it.status === 'done' && 'text-emerald-600',
                    it.status === 'error' && 'text-destructive',
                  )}
                />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{it.name}</span>
                  {it.status === 'error' && <span className="text-destructive">{it.error}</span>}
                </span>
                {it.status !== 'error' && (
                  <span className="shrink-0 text-muted-foreground">
                    {t(`media.upload.status.${it.status}`)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
