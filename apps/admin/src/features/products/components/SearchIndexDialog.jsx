import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SearchForm } from '@/components/SearchForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/features/settings/components/controls';
import { apiData, api } from '@/lib/apiClient';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';

const STATUS_KEY = ['search', 'status'];

/**
 * Storefront search tools: index size, background rebuild, and a live preview of what shoppers
 * get for a query in each language (normalization, ranking, Arabic).
 */
export function SearchIndexDialog({ open, onOpenChange }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <div className="grid gap-1 pe-8">
          <DialogTitle>{t('search.title')}</DialogTitle>
          <DialogDescription>{t('search.description')}</DialogDescription>
        </div>
        {open && <Body />}
      </DialogContent>
    </Dialog>
  );
}

function Body() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('en');
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => apiData('/api/v1/search/status'),
    refetchInterval: (query) => (query.state.data?.rebuilding ? 1500 : false),
  });
  const rebuild = useMutation({
    mutationFn: () => apiData('/api/v1/search/rebuild', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  const preview = useQuery({
    queryKey: ['search', 'preview', q, lang],
    queryFn: () => api('/api/v1/search', { query: { q, lang, limit: 10 }, auth: false }),
    enabled: Boolean(q),
  });
  const s = status.data;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {s && (
          <>
            <Badge tone={s.rebuilding ? 'warn' : 'ok'}>
              {t(s.rebuilding ? 'search.rebuilding' : 'search.ready')}
            </Badge>
            <span>{t('search.documents', { count: s.documents })}</span>
            {s.lastRebuild && (
              <span className="text-muted-foreground">
                {t('search.lastRebuild', { at: fmt.dateTime(s.lastRebuild.at) })}
              </span>
            )}
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ms-auto"
          disabled={s?.rebuilding || rebuild.isPending}
          onClick={() => rebuild.mutate()}
        >
          <RefreshCw className="size-4" aria-hidden />
          {t('search.rebuild')}
        </Button>
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchForm label={t('search.tryLabel')} onSearch={setQ} />
          <div className="w-32">
            <Select
              aria-label={t('search.language')}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="en">{t('search.languages.en')}</option>
              <option value="ar">{t('search.languages.ar')}</option>
            </Select>
          </div>
        </div>
        {q && preview.data && (
          <ol className="grid gap-1 text-sm" aria-label={t('search.results')}>
            {preview.data.data.length === 0 && (
              <li className="text-muted-foreground">{t('search.noResults')}</li>
            )}
            {preview.data.data.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2"
                dir={lang === 'ar' ? 'rtl' : undefined}
                lang={lang}
              >
                {p.image ? (
                  <img src={p.image.thumbUrl} alt="" className="size-8 rounded object-cover" />
                ) : (
                  <span className="size-8 rounded bg-muted" />
                )}
                <span className="truncate">{p.name}</span>
                <span className="ms-auto shrink-0 text-muted-foreground" dir="ltr">
                  {fmt.money(p.priceMin)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
