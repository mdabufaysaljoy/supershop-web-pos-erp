/**
 * The page renderer (P5.1). ONE component draws a page, used by the storefront (server-rendered,
 * for SEO) and by the admin's preview — so what an editor sees is what a visitor gets.
 *
 * It is deliberately dumb: it receives blocks whose text is ALREADY in the right language
 * (`localizeBlocks` did that) and a map of type → component. Unknown types are skipped rather
 * than thrown, because a page saved with a block an older deploy does not know must still render.
 */
export function BlockRenderer({ blocks = [], components = {}, context = {}, onUnknown }) {
  return blocks.map((block) => {
    const Component = components[block.type];
    if (!Component) {
      onUnknown?.(block);
      return null;
    }
    // A container block renders whatever is nested inside it, with this same renderer.
    return (
      <Component key={block.id} id={block.id} {...block.props} context={context}>
        {block.blocks?.length ? (
          <BlockRenderer
            blocks={block.blocks}
            components={components}
            context={context}
            onUnknown={onUnknown}
          />
        ) : null}
      </Component>
    );
  });
}
