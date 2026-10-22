import { blockPalette } from '@supershop/shared';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * What can be put on a page. The list comes from the registry (P5.1), so a new block type appears
 * here the moment it is defined — no palette to update.
 */
export function BlockPalette({ onAdd, disabled }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2">
      <h2 className="text-sm font-medium">{t('cms.builder.addBlock')}</h2>
      <ul className="grid gap-1">
        {blockPalette().map((block) => (
          <li key={block.type}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAdd(block.type)}
              className="flex w-full items-center gap-2 rounded border px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50"
            >
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {block.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
