import { describe, expect, it } from 'vitest';
import { buildTree, childCount, descendantIds, parentOptions, reorderLocally } from '../tree';

const c = (id, parentId, position) => ({ id, parentId, position, name: { en: id } });
const LIST = [
  c('B', null, 1),
  c('A', null, 0),
  c('A2', 'A', 1),
  c('A1', 'A', 0),
  c('A11', 'A1', 0),
];

describe('category tree helpers', () => {
  it('builds an ordered nested tree', () => {
    const tree = buildTree(LIST);
    expect(tree.map((n) => n.id)).toEqual(['A', 'B']);
    expect(tree[0].children.map((n) => n.id)).toEqual(['A1', 'A2']);
    expect(tree[0].children[0].children[0].id).toBe('A11');
  });

  it('finds descendants and excludes them from parent options', () => {
    expect([...descendantIds(LIST, 'A')].sort()).toEqual(['A1', 'A11', 'A2']);
    expect(parentOptions(LIST, 'A1')).toEqual([
      { id: 'A', label: 'A', depth: 0 },
      { id: 'A2', label: 'A2', depth: 1 },
      { id: 'B', label: 'B', depth: 0 },
    ]);
    expect(childCount(LIST, 'A')).toBe(2);
  });

  it('reorders siblings locally', () => {
    const next = reorderLocally(LIST, { id: 'B', parentId: null, index: 0 });
    expect(buildTree(next).map((n) => n.id)).toEqual(['B', 'A']);
    const clamped = reorderLocally(LIST, { id: 'A1', parentId: 'A', index: 99 });
    expect(buildTree(clamped)[0].children.map((n) => n.id)).toEqual(['A2', 'A1']);
  });
});
