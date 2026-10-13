import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const TONE = { done: 'ok', pending: 'warn', failed: 'bad', stale: 'warn', manual: 'ok' };

/**
 * Read-only view of the automatic Arabic for a LocalizedString field, with its status. English is
 * the only language staff type (CLAUDE.md §5.7); corrections happen in Settings → Languages.
 * @param {{ label: string, value?: { en?: string, ar?: string, meta?: object } }} props
 */
export function ArabicPreview({ label, value }) {
  const { t } = useTranslation();
  if (!value?.en) return null;
  const meta = value.meta?.ar;
  const status = meta?.mode === 'manual' ? 'manual' : meta?.status;
  return (
    <div className="grid gap-1 text-sm">
      <span className="flex items-center gap-2 font-medium">
        {label}
        {status && (
          <Badge tone={TONE[status] ?? 'muted'}>{t(`translation.status.${status}`)}</Badge>
        )}
      </span>
      <span dir="rtl" lang="ar" className="text-muted-foreground">
        {value.ar || '—'}
      </span>
    </div>
  );
}
