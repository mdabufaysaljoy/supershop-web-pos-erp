import { NOTIFICATION } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Badge, Checkbox } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useUpdateTemplate } from '../hooks';

/**
 * One message the shop sends. Staff write English only — the Arabic underneath is generated and
 * shown read-only (§5.7). `{{variables}}` survive translation, so they can be used in any wording.
 */
export function TemplateRow({ template, canEdit }) {
  const { t } = useTranslation();
  const update = useUpdateTemplate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});

  const edit = draft ?? { subject: template.subject?.en ?? '', body: template.body?.en ?? '' };
  const isSms = template.channel === 'sms';

  const save = async () => {
    setErrors({});
    try {
      await update.mutateAsync({
        id: template.id,
        ...(isSms ? {} : { subject: edit.subject }),
        body: edit.body,
      });
      setDraft(null);
    } catch (err) {
      if (err?.code === 'VALIDATION_ERROR')
        setErrors(Object.fromEntries((err.details ?? []).map((d) => [d.path, d.message])));
    }
  };

  return (
    <li className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t(`notifications.events.${template.event}`)}</span>
            <Badge tone={isSms ? 'warn' : 'muted'}>
              {t(`notifications.channels.${template.channel}`)}
            </Badge>
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {isSms ? template.body?.en : template.subject?.en}
          </span>
        </div>
        <Checkbox
          id={`enabled-${template.id}`}
          label={t('notifications.templates.enabled')}
          checked={template.enabled}
          disabled={!canEdit || update.isPending}
          onChange={(e) => update.mutate({ id: template.id, enabled: e.target.checked })}
        />
        <button
          type="button"
          className="text-sm underline underline-offset-4"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t('common.close') : t('common.edit')}
        </button>
      </div>

      {open && (
        <div className="grid gap-4 border-t p-4">
          {!isSms && (
            <>
              <FormField
                label={t('notifications.templates.subject')}
                error={fieldMessage(t, errors.subject)}
              >
                <PlainTextInput
                  maxLength={NOTIFICATION.SUBJECT_MAX}
                  value={edit.subject}
                  disabled={!canEdit}
                  onChange={(e) => setDraft({ ...edit, subject: e.target.value })}
                />
              </FormField>
              <ArabicPreview
                label={t('notifications.templates.arabicSubject')}
                value={template.subject}
              />
            </>
          )}

          <FormField
            label={t('notifications.templates.body')}
            description={t('notifications.templates.bodyHelp')}
            error={fieldMessage(t, errors.body)}
          >
            <PlainTextArea
              rows={isSms ? 3 : 8}
              maxLength={NOTIFICATION.BODY_MAX}
              value={edit.body}
              disabled={!canEdit}
              onChange={(e) => setDraft({ ...edit, body: e.target.value })}
            />
          </FormField>
          <ArabicPreview label={t('notifications.templates.arabicBody')} value={template.body} />

          <div className="flex gap-3">
            <button
              type="button"
              disabled={!canEdit || !draft || update.isPending}
              onClick={save}
              className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {t('common.save')}
            </button>
            {draft && (
              <button
                type="button"
                className="h-10 rounded-md border px-5 text-sm"
                onClick={() => setDraft(null)}
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
