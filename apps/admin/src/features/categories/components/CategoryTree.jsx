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
import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Category tree. Each sibling list is its own sortable area: drag a row by its handle (or focus the
 * handle, Space, arrows, Space) to reorder among siblings. Re-parenting is done in the form
 * ("Parent category") so a drop can never land somewhere unintended.
 */
export function CategoryTree({ tree, selectedId, onSelect, onAddChild, onMove }) {
  return (
    <SortableLevel
      nodes={tree}
      parentId={null}
      selectedId={selectedId}
      onSelect={onSelect}
      onAddChild={onAddChild}
      onMove={onMove}
    />
  );
}

function SortableLevel({ nodes, parentId, ...rest }) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nameOf = (id) => nodes.find((n) => n.id === id)?.name?.en ?? '';
  const positionOf = (id) => nodes.findIndex((n) => n.id === id) + 1;
  const announcements = {
    onDragStart: ({ active }) => t('categories.dnd.picked', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('categories.dnd.over', { name: nameOf(active.id), position: positionOf(over.id) })
        : '',
    onDragEnd: ({ active, over }) =>
      over
        ? t('categories.dnd.dropped', { name: nameOf(active.id), position: positionOf(over.id) })
        : '',
    onDragCancel: ({ active }) => t('categories.dnd.cancelled', { name: nameOf(active.id) }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('categories.dnd.instructions') },
      }}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        rest.onMove({
          id: String(active.id),
          parentId,
          index: nodes.findIndex((n) => n.id === over.id),
        });
      }}
    >
      <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <ul className="grid gap-0.5">
          {nodes.map((node) => (
            <TreeRow key={node.id} node={node} {...rest} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function TreeRow({ node, selectedId, onSelect, onAddChild, onMove }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });
  const name = node.name?.en ?? '';
  const hasChildren = node.children.length > 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10 opacity-80')}
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted',
          selectedId === node.id && 'bg-muted',
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="cursor-grab rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
          aria-label={t('categories.dragHandle', { name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        {hasChildren ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            aria-label={t(open ? 'categories.collapse' : 'categories.expand', { name })}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-4 transition-transform rtl:-scale-x-100', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        {node.image ? (
          <img src={node.image.thumbUrl} alt="" className="size-6 shrink-0 rounded object-cover" />
        ) : (
          <span className="size-6 shrink-0 rounded bg-muted-foreground/10" aria-hidden />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate rounded px-1 text-start text-sm"
          aria-current={selectedId === node.id ? 'true' : undefined}
          onClick={() => onSelect(node.id)}
        >
          {name}
        </button>
        {!node.isActive && <Badge>{t('categories.hidden')}</Badge>}
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={t('categories.addChild', { name })}
          onClick={() => onAddChild(node.id)}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {open && hasChildren && (
        <div className="ms-6 border-s ps-1">
          <SortableLevel
            nodes={node.children}
            parentId={node.id}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onMove={onMove}
          />
        </div>
      )}
    </li>
  );
}
