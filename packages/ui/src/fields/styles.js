/**
 * Default input look (shadcn/ui tokens: border-input, ring, destructive). Apps must let Tailwind scan
 * this package: `@source "../../../packages/ui/src";` in their CSS.
 */
export const inputClass =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20';

/** Multi-line variant: same look, natural height. */
export const textareaClass = inputClass
  .replace('flex h-9', 'flex min-h-20')
  .replace('py-1', 'py-2');
