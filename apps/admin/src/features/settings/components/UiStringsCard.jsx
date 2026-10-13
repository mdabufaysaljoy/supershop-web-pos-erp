import { PlainTextInput } from '@supershop/ui';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldMessage } from '@/lib/i18n';
import { useDeleteUiOverride, useSaveUiOverride, useUiOverrides } from '../hooks';
import { buildRows, NEEDS_REVIEW, sha256Hex, STOREFRONT_EN } from '../uiStrings';
import { Badge, Select } from './controls';

const LANG = 'ar';
const STATUS_TONE = { override: 'ok', overrideStale: 'warn', machine: 'muted', english: 'bad' };

/**
 * Storefront UI text: English | machine Arabic | human correction. Corrections go live on the
 * storefront within a minute (no deploy). Placeholders like {{store}} must be kept.
 */
export function UiStringsCard({ canEdit }) {
  const { t } = useTranslation();
  const { data: overrides = [] } = useUiOverrides(LANG);
  const save = useSaveUiOverride(LANG);
  const revert = useDeleteUiOverride(LANG);
  const [enHashes, setEnHashes] = useState(null);
  const [filter, setFilter] = useState('review');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({}); // key → text being edited

  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(STOREFRONT_EN).map(async ([k, v]) => [k, await sha256Hex(v)])).then(
      (pairs) => alive && setEnHashes(Object.fromEntries(pairs)),
    );
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(
    () => (enHashes ? buildRows(LANG, overrides, enHashes) : []),
    [overrides, enHashes],
  );
  const needsReview = rows.filter((r) => NEEDS_REVIEW.has(r.status)).length;
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (filter === 'all' ||
        (filter === 'review' ? NEEDS_REVIEW.has(r.status) : r.status === filter)) &&
      (!q || r.key.toLowerCase().includes(q) || r.en.toLowerCase().includes(q)),
  );
  const fieldError = (key) =>
    save.variables?.key === key ? fieldMessage(t, save.error?.details?.[0]?.message) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('languages.ui.title')}</h2>
        </CardTitle>
        <CardDescription>{t('languages.ui.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label={t('languages.ui.filter')}
            className="w-56"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="review">{t('languages.ui.filterReview', { count: needsReview })}</option>
            <option value="all">{t('languages.ui.filterAll', { count: rows.length })}</option>
            <option value="machine">{t('languages.ui.status.machine')}</option>
            <option value="override">{t('languages.ui.status.override')}</option>
          </Select>
          <PlainTextInput
            aria-label={t('languages.ui.search')}
            placeholder={t('languages.ui.search')}
            className="w-64"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('languages.ui.empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {visible.map((r) => {
              const current = r.override ?? r.machine ?? '';
              const value = draft[r.key] ?? current;
              const error = fieldError(r.key);
              return (
                <li key={r.key} className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-muted-foreground">{r.key}</code>
                      <Badge tone={STATUS_TONE[r.status]}>
                        {t(`languages.ui.status.${r.status}`)}
                      </Badge>
                    </div>
                    <p className="text-sm">{r.en}</p>
                    {r.override && r.machine && (
                      <p className="text-xs text-muted-foreground">
                        {t('languages.ui.machineWas')}{' '}
                        <span dir="rtl" lang="ar">
                          {r.machine}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <PlainTextInput
                      aria-label={t('languages.ui.arabicFor', { key: r.key })}
                      dir="rtl"
                      lang="ar"
                      maxLength={500}
                      value={value}
                      disabled={!canEdit}
                      aria-invalid={error ? true : undefined}
                      onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={
                            !value.trim() ||
                            (value === current && r.status !== 'overrideStale') ||
                            save.isPending
                          }
                          onClick={() =>
                            save.mutate(
                              { key: r.key, body: { value, source: r.en } },
                              { onSuccess: () => setDraft(({ [r.key]: _, ...rest }) => rest) },
                            )
                          }
                        >
                          {r.status === 'overrideStale'
                            ? t('languages.ui.confirm')
                            : t('common.save')}
                        </Button>
                        {r.override && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={revert.isPending}
                            onClick={() => revert.mutate(r.key)}
                          >
                            {t('languages.ui.revert')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
