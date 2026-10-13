import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldMessage } from '@/lib/i18n';
import {
  useCreateGlossaryTerm,
  useDeleteGlossaryTerm,
  useGlossary,
  useUpdateGlossaryTerm,
} from '../hooks';
import { Badge, Select } from './controls';

const EMPTY = { term: '', type: 'preferred', ar: '' };
const toBody = (f) => ({
  term: f.term,
  doNotTranslate: f.type === 'keep',
  targets: f.type === 'keep' ? {} : { ar: f.ar },
});

/**
 * Glossary: words the engine must never translate (brands, payment names) and preferred
 * translations for common shop terms. Any change makes affected texts re-translate (new cache key).
 */
export function GlossaryCard({ canEdit }) {
  const { t } = useTranslation();
  const { data: terms = [] } = useGlossary();
  const create = useCreateGlossaryTerm();
  const update = useUpdateGlossaryTerm();
  const remove = useDeleteGlossaryTerm();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // term id being edited

  const active = editing ? update : create;
  const errors = Object.fromEntries(
    (active.error?.details ?? []).map((d) => [d.path.split('.')[0], d.message]),
  );
  const submit = (e) => {
    e.preventDefault();
    const done = { onSuccess: () => (setForm(EMPTY), setEditing(null)) };
    if (editing) update.mutate({ id: editing, body: toBody(form) }, done);
    else create.mutate(toBody(form), done);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('languages.glossary.title')}</h2>
        </CardTitle>
        <CardDescription>{t('languages.glossary.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {canEdit && (
          <form
            className="grid items-end gap-3 md:grid-cols-[1fr_12rem_1fr_auto]"
            onSubmit={submit}
          >
            <FormField label={t('languages.glossary.term')} error={fieldMessage(t, errors.term)}>
              <PlainTextInput
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
              />
            </FormField>
            <FormField label={t('languages.glossary.type')}>
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="preferred">{t('languages.glossary.preferred')}</option>
                <option value="keep">{t('languages.glossary.keep')}</option>
              </Select>
            </FormField>
            <FormField
              label={t('languages.glossary.arabic')}
              error={fieldMessage(t, errors.targets)}
            >
              <PlainTextInput
                dir="rtl"
                lang="ar"
                value={form.ar}
                disabled={form.type === 'keep'}
                onChange={(e) => setForm({ ...form, ar: e.target.value })}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" disabled={active.isPending}>
                {editing ? t('common.save') : t('common.add')}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => (setEditing(null), setForm(EMPTY))}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </form>
        )}

        {terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('languages.glossary.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pe-4 text-start font-medium">
                    {t('languages.glossary.term')}
                  </th>
                  <th className="py-2 pe-4 text-start font-medium">
                    {t('languages.glossary.type')}
                  </th>
                  <th className="py-2 pe-4 text-start font-medium">
                    {t('languages.glossary.arabic')}
                  </th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id} className="border-b last:border-0">
                    <td className="py-2 pe-4 font-medium">{term.term}</td>
                    <td className="py-2 pe-4">
                      {term.doNotTranslate ? (
                        <Badge>{t('languages.glossary.keep')}</Badge>
                      ) : (
                        <Badge tone="ok">{t('languages.glossary.preferred')}</Badge>
                      )}
                    </td>
                    <td className="py-2 pe-4" dir="rtl" lang="ar">
                      {term.targets.ar ?? '—'}
                    </td>
                    <td className="py-2 text-end whitespace-nowrap">
                      {canEdit && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(term.id);
                              setForm({
                                term: term.term,
                                type: term.doNotTranslate ? 'keep' : 'preferred',
                                ar: term.targets.ar ?? '',
                              });
                            }}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(term.id)}>
                            {t('common.delete')}
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
