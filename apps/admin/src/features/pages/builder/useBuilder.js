import { blockPalette, getBlock, syncTexts } from '@supershop/shared';
import { useCallback, useMemo, useState } from 'react';

/**
 * The builder's state (P5.2): the page being edited, what is selected, and the history behind
 * undo/redo. Everything that changes the page goes through `commit`, so undo/redo and "there are
 * unsaved changes" can never drift apart.
 *
 * History lives in state, not refs: the toolbar renders from it, and React must see it change.
 */
const HISTORY_LIMIT = 50;
let counter = 0;

/** Block ids must be unique on a page and readable inside a translation key. */
export const newBlockId = () => `blk-${Date.now().toString(36)}-${(counter += 1).toString(36)}`;

export const paletteItems = () => blockPalette();

/** A new block of `type`, filled in from its registered defaults. */
export function createBlock(type) {
  const definition = getBlock(type);
  return {
    id: newBlockId(),
    type,
    version: definition?.version ?? 1,
    props: { ...definition?.defaults },
  };
}

/** @param {{ blocks: object[] }} initial the saved draft */
export function useBuilder(initial) {
  const [history, setHistory] = useState(() => ({
    present: { blocks: initial?.blocks ?? [] },
    past: [],
    future: [],
  }));
  const [selectedId, setSelectedId] = useState(null);

  /** Every change goes through here: the old page joins the past, redo is dropped. */
  const commit = useCallback((next) => {
    setHistory((h) => ({
      present: typeof next === 'function' ? next(h.present) : next,
      past: [...h.past, h.present].slice(-HISTORY_LIMIT),
      future: [],
    }));
  }, []);

  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length === 0
          ? h
          : { present: h.past.at(-1), past: h.past.slice(0, -1), future: [h.present, ...h.future] },
      ),
    [],
  );

  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length === 0
          ? h
          : { present: h.future[0], past: [...h.past, h.present], future: h.future.slice(1) },
      ),
    [],
  );

  const actions = useMemo(
    () => ({
      add: (type, index) => {
        const block = createBlock(type);
        commit((current) => {
          const blocks = [...current.blocks];
          blocks.splice(index ?? blocks.length, 0, block);
          return { ...current, blocks };
        });
        setSelectedId(block.id);
        return block;
      },
      remove: (id) => {
        commit((current) => ({ ...current, blocks: current.blocks.filter((b) => b.id !== id) }));
        setSelectedId((selected) => (selected === id ? null : selected));
      },
      duplicate: (id) =>
        commit((current) => {
          const index = current.blocks.findIndex((b) => b.id === id);
          if (index < 0) return current;
          const copy = {
            ...current.blocks[index],
            id: newBlockId(),
            props: { ...current.blocks[index].props },
          };
          const blocks = [...current.blocks];
          blocks.splice(index + 1, 0, copy);
          return { ...current, blocks };
        }),
      /** Dropping a block: move it from where it was to where it landed. */
      move: (fromId, toId) =>
        commit((current) => {
          const from = current.blocks.findIndex((b) => b.id === fromId);
          const to = current.blocks.findIndex((b) => b.id === toId);
          if (from < 0 || to < 0 || from === to) return current;
          const blocks = [...current.blocks];
          const [moved] = blocks.splice(from, 1);
          blocks.splice(to, 0, moved);
          return { ...current, blocks };
        }),
      setProp: (id, name, value) =>
        commit((current) => ({
          ...current,
          blocks: current.blocks.map((b) =>
            b.id === id ? { ...b, props: { ...b.props, [name]: value } } : b,
          ),
        })),
      /** Used when an older version is restored into the draft. */
      replace: (next) => {
        commit(() => ({ blocks: next?.blocks ?? [] }));
        setSelectedId(null);
      },
    }),
    [commit],
  );

  const content = history.present;
  return {
    content,
    selected: content.blocks.find((b) => b.id === selectedId) ?? null,
    selectedId,
    select: setSelectedId,
    ...actions,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    /** The page's text as it stands right now (what the preview and the save would carry). */
    textsNow: (saved) => syncTexts(content, saved ?? []),
  };
}
