import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getBlock, localizeBlocks } from '@supershop/shared';
import { ALL_BLOCK_COMPONENTS, BlockRenderer } from '@supershop/ui';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * The canvas (P5.2): the page as it will look, with each block draggable and selectable. It draws
 * with the SAME renderer the storefront uses (P5.1), so this is the page, not an impression of it.
 * Dragging works with a mouse and with the keyboard (dnd-kit's keyboard sensor).
 */
export function BuilderCanvas({
  content,
  texts,
  selectedId,
  onSelect,
  onMove,
  onRemove,
  onDuplicate,
  width = 'desktop',
  lang = 'en',
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const localized = localizeBlocks(content.blocks, texts, lang);
  const frame = { desktop: 'max-w-5xl', tablet: 'max-w-2xl', mobile: 'max-w-sm' }[width];

  if (content.blocks.length === 0)
    return (
      <p className="rounded border border-dashed p-12 text-center text-sm text-muted-foreground">
        {t('cms.builder.emptyCanvas')}
      </p>
    );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ screenReaderInstructions: { draggable: t('cms.builder.dndInstructions') } }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(active.id, over.id);
      }}
    >
      <SortableContext
        items={content.blocks.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          lang={lang}
          className={cn('mx-auto grid w-full gap-2 transition-[max-width]', frame)}
        >
          {content.blocks.map((block, index) => (
            <CanvasBlock
              key={block.id}
              block={block}
              rendered={localized[index]}
              selected={block.id === selectedId}
              onSelect={() => onSelect(block.id)}
              onRemove={() => onRemove(block.id)}
              onDuplicate={() => onDuplicate(block.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function CanvasBlock({ block, rendered, selected, onSelect, onRemove, onDuplicate }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const definition = getBlock(block.type);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative rounded border-2 bg-background p-4',
        selected ? 'border-primary' : 'border-transparent hover:border-border',
        isDragging && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={t('cms.builder.selectBlock', { block: definition?.label ?? block.type })}
        className="absolute inset-0 z-0 cursor-pointer"
      />
      <div className="pointer-events-none relative z-10">
        <BlockRenderer
          blocks={[rendered]}
          components={ALL_BLOCK_COMPONENTS}
          context={{ media: {} }}
        />
      </div>
      <div className="absolute end-2 top-2 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('cms.builder.dragBlock', { block: definition?.label ?? block.type })}
          className="grid size-7 place-items-center rounded border bg-background"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          aria-label={t('cms.builder.duplicateBlock')}
          className="grid size-7 place-items-center rounded border bg-background"
        >
          <Copy className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('cms.builder.removeBlock')}
          className="grid size-7 place-items-center rounded border bg-background text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
