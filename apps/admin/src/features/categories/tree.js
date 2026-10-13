/**
 * Pure helpers over the flat category list returned by the API
 * (`{ id, parentId, position, ... }`). Kept framework-free for unit tests.
 */

const byPosition = (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1);

/** Nested tree: `[{ ...category, children: [...] }]`, siblings ordered by position. */
export function buildTree(list) {
  const nodes = new Map(list.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentId && nodes.get(node.parentId);
    (parent ? parent.children : roots).push(node);
  }
  const sort = (arr) => {
    arr.sort(byPosition);
    arr.forEach((n) => sort(n.children));
    return arr;
  };
  return sort(roots);
}

/** Ids of every category below `id`. */
export function descendantIds(list, id) {
  const children = new Map();
  for (const c of list) {
    if (!children.has(c.parentId)) children.set(c.parentId, []);
    children.get(c.parentId).push(c.id);
  }
  const out = new Set();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop();
    out.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}

/** Depth-first `[{ id, label, depth }]` for parent pickers, skipping `excludeId` and its subtree. */
export function parentOptions(list, excludeId) {
  const skip = excludeId ? new Set([excludeId, ...descendantIds(list, excludeId)]) : new Set();
  const out = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      if (skip.has(n.id)) continue;
      out.push({ id: n.id, label: n.name?.en ?? '', depth });
      walk(n.children, depth + 1);
    }
  };
  walk(buildTree(list), 0);
  return out;
}

/** Same-parent reorder applied locally (optimistic update before the server confirms). */
export function reorderLocally(list, { id, parentId, index }) {
  const siblings = list
    .filter((c) => c.parentId === parentId && c.id !== id)
    .sort(byPosition)
    .map((c) => c.id);
  siblings.splice(Math.min(index, siblings.length), 0, id);
  const position = new Map(siblings.map((sid, i) => [sid, i]));
  return list.map((c) =>
    position.has(c.id) ? { ...c, parentId, position: position.get(c.id) } : c,
  );
}

export const childCount = (list, parentId) => list.filter((c) => c.parentId === parentId).length;
