import { SITE } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useCreateRedirect, useDeleteRedirect, useRedirects } from '../resource';

/**
 * Redirects (P5.5): "this address moved there", or "it is gone". Rules are written for the
 * language-neutral address, so one rule serves English and Arabic; the storefront answers them
 * before anything renders.
 */
const EMPTY = { from: '', to: '', status: 301, note: '' };

export function RedirectsCard({ disabled }) {
  const { t } = useTranslation();
  const { data: redirects = [], isPending } = useRedirects();
  const create = useCreateRedirect();
  const remove = useDeleteRedirect();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState(EMPTY);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const gone = draft.status === 410;

  const add = async () => {
    const saved = await run(
      create.mutateAsync({
        from: draft.from,
        to: gone ? '' : draft.to,
        status: draft.status,
        note: draft.note,
      }),
    );
    if (saved) setDraft(EMPTY);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.redirects.title')}</CardTitle>
        <CardDescription>{t('appearance.redirects.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isPending ? null : redirects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('appearance.redirects.empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {redirects.map((redirect) => (
              <li
                key={redirect.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2 text-sm"
              >
                <span dir="ltr" className="font-mono">
                  {redirect.from}
                </span>
                <Badge tone={redirect.status === 410 ? 'bad' : 'muted'}>
                  {t(`appearance.redirects.status.${redirect.status}`)}
                </Badge>
                {redirect.to && (
                  <span dir="ltr" className="font-mono text-muted-foreground">
                    → {redirect.to}
                  </span>
                )}
                {redirect.note && <span className="text-muted-foreground">{redirect.note}</span>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  disabled={disabled || remove.isPending}
                  onClick={() => remove.mutate(redirect.id)}
                >
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 rounded-xl border border-dashed p-4 sm:grid-cols-2">
          <FormField
            label={t('appearance.redirects.from')}
            description={t('appearance.redirects.fromHelp')}
            error={fieldMessage(t, errors.from)}
          >
            <PlainTextInput
              value={draft.from}
              dir="ltr"
              disabled={disabled}
              onChange={(e) => set({ from: e.target.value })}
            />
          </FormField>
          <FormField label={t('appearance.redirects.statusLabel')}>
            <Select
              value={String(draft.status)}
              disabled={disabled}
              onChange={(e) => set({ status: Number(e.target.value) })}
            >
              {SITE.REDIRECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`appearance.redirects.status.${status}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {!gone && (
            <FormField
              label={t('appearance.redirects.to')}
              description={t('appearance.redirects.toHelp')}
              error={fieldMessage(t, errors.to)}
            >
              <PlainTextInput
                value={draft.to}
                dir="ltr"
                disabled={disabled}
                onChange={(e) => set({ to: e.target.value })}
              />
            </FormField>
          )}
          <FormField label={t('appearance.redirects.note')} error={fieldMessage(t, errors.note)}>
            <PlainTextInput
              value={draft.note}
              disabled={disabled}
              onChange={(e) => set({ note: e.target.value })}
            />
          </FormField>
          <Button
            type="button"
            className="justify-self-start sm:col-span-2"
            disabled={disabled || !draft.from || create.isPending}
            onClick={add}
          >
            {t('appearance.redirects.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
