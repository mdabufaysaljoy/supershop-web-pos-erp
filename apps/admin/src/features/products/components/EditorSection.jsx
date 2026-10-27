import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One step of the product form: a number, what it is for in a line, and the fields themselves.
 *
 * A product has a lot of parts, and only the first few matter to most of them — so a step that is
 * nobody's business until it is (search engine listing, the shop's own extra fields) can be
 * `collapsible`, and opens itself as soon as it holds something or something in it is wrong.
 */
export function EditorSection({
  step,
  title,
  description,
  collapsible = false,
  defaultOpen = true,
  children,
}) {
  const header = (
    <>
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {step}
      </span>
      <span className="grid min-w-0 gap-0.5 text-start">
        <span className="text-base font-semibold leading-tight">{title}</span>
        {description && (
          <span className="text-sm font-normal text-muted-foreground">{description}</span>
        )}
      </span>
    </>
  );

  if (!collapsible) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>
            <h2 className="flex items-start gap-2.5">{header}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    );
  }

  return (
    <details
      open={defaultOpen}
      className={cn(
        'group flex flex-col gap-6 rounded border bg-card py-6 text-card-foreground shadow-sm',
      )}
    >
      <summary className="flex cursor-pointer list-none items-start gap-2.5 p-6 pb-3 [&::-webkit-details-marker]:hidden">
        {header}
        <ChevronRight
          className="ms-auto mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 rtl:-scale-x-100 rtl:group-open:-rotate-90"
          aria-hidden
        />
      </summary>
      <CardContent className="grid gap-4">{children}</CardContent>
    </details>
  );
}
