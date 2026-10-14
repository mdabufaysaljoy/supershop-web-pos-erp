import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { fieldMessage } from '@/lib/i18n';
import { pages } from '../resource';

/**
 * Starting a page (P5.4) asks for its name only — the address is derived from it, and the blocks
 * are what the builder is for. It opens straight into the builder, where the work happens.
 */
export function NewPageDialog({ disabled }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = pages.useCreate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const page = await create.mutateAsync({ title });
      setOpen(false);
      setTitle('');
      navigate(`/pages/${page.id}`);
    } catch (err) {
      setError((err?.details ?? []).find((d) => d.path === 'title')?.message ?? null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          {t('cms.newPage.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogTitle>{t('cms.newPage.title')}</DialogTitle>
        <DialogDescription>{t('cms.newPage.description')}</DialogDescription>
        <form className="grid gap-4" onSubmit={submit}>
          <FormField label={t('cms.newPage.name')} error={fieldMessage(t, error)} required>
            <PlainTextInput
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
          </FormField>
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            {t('cms.newPage.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
