import { blockEditors, getBlock } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Select } from '@/features/settings/components/controls';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { Button } from '@/components/ui/button';

/**
 * The props panel (P5.2) is generated from the registry: each prop declares the control it wants
 * (`text`, `richText`, `select`, `media`), so a new block type is editable the moment it is
 * defined — there is no per-block form to write.
 *
 * Text props show their generated Arabic underneath, read-only: staff write English only (§5.7).
 */
export function PropsPanel({ block, texts, onChange, disabled }) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(null);

  if (!block)
    return <p className="text-sm text-muted-foreground">{t('cms.builder.selectToEdit')}</p>;

  const definition = getBlock(block.type);
  const translatedValue = (prop) =>
    texts?.find((entry) => entry.key === `${block.id}.${prop}`)?.value;

  return (
    <div className="grid gap-4">
      <h2 className="text-sm font-medium">{definition?.label ?? block.type}</h2>

      {blockEditors(block.type).map((editor) => {
        const value = block.props?.[editor.name] ?? '';
        const common = { label: editor.label, description: editor.help };

        if (editor.control === 'select')
          return (
            <FormField key={editor.name} {...common}>
              <Select
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(editor.name, e.target.value)}
              >
                {editor.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </FormField>
          );

        if (editor.control === 'media')
          return (
            <FormField key={editor.name} {...common}>
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setPicking(editor.name)}
                >
                  {value ? t('cms.builder.changeImage') : t('cms.builder.chooseImage')}
                </Button>
                {value && (
                  <button
                    type="button"
                    className="justify-self-start text-xs underline"
                    onClick={() => onChange(editor.name, null)}
                  >
                    {t('cms.builder.removeImage')}
                  </button>
                )}
              </div>
            </FormField>
          );

        if (editor.control === 'richText')
          return (
            <div key={editor.name} className="grid gap-2">
              <FormField label={editor.label} description={editor.help}>
                <PlainTextArea
                  rows={6}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => onChange(editor.name, e.target.value)}
                />
              </FormField>
              <ArabicPreview label={t('cms.builder.arabic')} value={translatedValue(editor.name)} />
            </div>
          );

        return (
          <div key={editor.name} className="grid gap-2">
            <FormField label={editor.label} description={editor.help}>
              <PlainTextInput
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(editor.name, e.target.value)}
              />
            </FormField>
            {definition?.translatable.includes(editor.name) && (
              <ArabicPreview label={t('cms.builder.arabic')} value={translatedValue(editor.name)} />
            )}
          </div>
        );
      })}

      {picking && (
        <MediaPickerDialog
          open
          onOpenChange={() => setPicking(null)}
          onSelect={(media) => {
            onChange(picking, media.id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
