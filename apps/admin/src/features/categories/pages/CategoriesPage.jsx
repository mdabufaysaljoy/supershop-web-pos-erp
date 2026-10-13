import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/i18n';
import { CategoryForm } from '../components/CategoryForm';
import { CategoryTree } from '../components/CategoryTree';
import { useCategories, useMoveCategory } from '../hooks';
import { buildTree } from '../tree';

/**
 * Categories: tree (drag to reorder, + to add a subcategory) next to the editor for the selected
 * or new category.
 */
export function CategoriesPage() {
  const { t } = useTranslation();
  const { data: list = [], isPending, isError, error } = useCategories();
  const move = useMoveCategory();
  /** null | { mode: 'new', parentId } | { mode: 'edit', id } */
  const [editing, setEditing] = useState(null);
  const tree = buildTree(list);
  const selected = editing?.mode === 'edit' ? list.find((c) => c.id === editing.id) : null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('categories.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('categories.description')}</p>
        </div>
        <Button onClick={() => setEditing({ mode: 'new', parentId: null })}>
          <Plus className="size-4" aria-hidden />
          {t('categories.add')}
        </Button>
      </header>

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <Card>
          <CardContent className="pt-6">
            {isPending ? (
              <div className="grid gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : tree.length ? (
              <CategoryTree
                tree={tree}
                selectedId={selected?.id}
                onSelect={(id) => setEditing({ mode: 'edit', id })}
                onAddChild={(parentId) => setEditing({ mode: 'new', parentId })}
                onMove={(m) => move.mutate(m)}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('categories.empty')}
              </p>
            )}
            {tree.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">{t('categories.reorderHint')}</p>
            )}
          </CardContent>
        </Card>

        {editing && (editing.mode === 'new' || selected) ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{selected ? selected.name.en : t('categories.newTitle')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryForm
                key={selected ? `${selected.id}:${selected.updatedAt}` : `new:${editing.parentId}`}
                category={selected}
                parentId={editing.parentId}
                list={list}
                onSaved={(id) => setEditing({ mode: 'edit', id })}
                onCancel={() => setEditing(null)}
                onDeleted={() => setEditing(null)}
              />
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">{t('categories.selectHint')}</p>
        )}
      </div>
    </div>
  );
}
