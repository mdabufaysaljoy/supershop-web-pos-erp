import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImagePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { cn } from '@/lib/utils';

/**
 * Product gallery: add from the media library (multi-pick), drag to reorder (first = main image),
 * remove. `value`: `[{ id, url, thumbUrl }]`.
 */
export function GalleryEditor({ value, onChange, max, disabled }) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const toggle = (m) => {
    if (value.some((i) => i.id === m.id)) onChange(value.filter((i) => i.id !== m.id));
    else if (value.length < max) {
      onChange([...value, { id: m.id, url: m.url, thumbUrl: m.variants.thumb?.url ?? m.url }]);
    }
  };

  return (
    <div className="grid gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          screenReaderInstructions: { draggable: t('categories.dnd.instructions') },
        }}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const from = value.findIndex((i) => i.id === active.id);
          const to = value.findIndex((i) => i.id === over.id);
          onChange(arrayMove(value, from, to));
        }}
      >
        <SortableContext items={value.map((i) => i.id)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {value.map((img, index) => (
              <Tile
                key={img.id}
                img={img}
                main={index === 0}
                disabled={disabled}
                onRemove={() => onChange(value.filter((i) => i.id !== img.id))}
              />
            ))}
            {!disabled && value.length < max && (
              <li>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:bg-muted"
                >
                  <ImagePlus className="size-6" aria-hidden />
                  {t('products.gallery.add')}
                </button>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
      {value.length > 1 && (
        <p className="text-xs text-muted-foreground">{t('products.gallery.hint')}</p>
      )}
      <MediaPickerDialog
        open={picking}
        onOpenChange={setPicking}
        selectedIds={value.map((i) => i.id)}
        onSelect={toggle}
      />
    </div>
  );
}

function Tile({ img, main, disabled, onRemove }) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative aspect-square rounded-lg border bg-muted',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <img src={img.thumbUrl} alt="" className="size-full rounded-lg object-contain" />
      {main && (
        <span className="absolute start-1 top-1">
          <Badge tone="ok">{t('products.gallery.main')}</Badge>
        </span>
      )}
      {!disabled && (
        <>
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="absolute bottom-1 start-1 cursor-grab rounded bg-background/90 p-1 active:cursor-grabbing"
            aria-label={t('products.gallery.reorder')}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute end-1 top-1 size-7 bg-background/90"
            aria-label={t('products.gallery.remove')}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </>
      )}
    </li>
  );
}
