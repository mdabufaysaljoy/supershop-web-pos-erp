import { blockEditors, getBlock } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { PropControl, Repeater } from './PropControls';

/**
 * The props panel (P5.2/P5.3) is generated from the registry: each prop declares the control it
 * wants (`text`, `richText`, `select`, `media`, `number`, `datetime`, `code`, a repeater, or a
 * catalogue picker), so a new block type is editable the moment it is defined — there is no
 * per-block form to write.
 *
 * Text props show their generated Arabic underneath, read-only: staff write English only (§5.7).
 */
export function PropsPanel({ block, texts, onChange, disabled }) {
  const { t } = useTranslation();
  /** Which prop the media dialog is filling: `mediaId` or `slides.0.mediaId` inside a repeater. */
  const [picking, setPicking] = useState(null);

  if (!block)
    return <p className="text-sm text-muted-foreground">{t('cms.builder.selectToEdit')}</p>;

  const definition = getBlock(block.type);
  const translatedValue = (path) =>
    texts?.find((entry) => entry.key === `${block.id}.${path}`)?.value;
  /** Arabic for a translated prop; `undefined` for one that never is, which hides the preview. */
  const isTranslated = (path) =>
    Boolean(
      definition?.translatable.some((pattern) =>
        new RegExp(`^${pattern.split('*').join('\\d+')}$`).test(path),
      ),
    );
  const arabicOf = (path) => (isTranslated(path) ? (translatedValue(path) ?? '') : undefined);

  /** The media dialog writes back to a top-level prop or into one repeater item. */
  const applyMedia = (mediaId) => {
    const [name, index, field] = picking.split('.');
    if (field === undefined) return onChange(name, mediaId);
    const rows = block.props?.[name] ?? [];
    return onChange(
      name,
      rows.map((row, i) => (i === Number(index) ? { ...row, [field]: mediaId } : row)),
    );
  };

  return (
    <div className="grid gap-4">
      <h2 className="text-sm font-medium">{definition?.label ?? block.type}</h2>

      {blockEditors(block.type).map((editor) =>
        editor.control === 'repeater' ? (
          <Repeater
            key={editor.name}
            editor={editor}
            items={block.props?.[editor.name]}
            disabled={disabled}
            arabicFor={(index, field) => arabicOf(`${editor.name}.${index}.${field}`)}
            onPickMedia={setPicking}
            onChange={(next) => onChange(editor.name, next)}
          />
        ) : (
          <PropControl
            key={editor.name}
            editor={editor}
            value={block.props?.[editor.name]}
            disabled={disabled}
            arabic={arabicOf(editor.name)}
            onPickMedia={() => setPicking(editor.name)}
            onChange={(next) => onChange(editor.name, next)}
          />
        ),
      )}

      {picking && (
        <MediaPickerDialog
          open
          onOpenChange={() => setPicking(null)}
          onSelect={(media) => {
            applyMedia(media.id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
