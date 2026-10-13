'use client';

import { useId, useState } from 'react';

/** Filters: always visible on wide screens, behind a toggle on phones. */
export function FiltersPanel({ label, activeCount, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="flex h-10 items-center justify-between rounded-md border px-3 text-sm font-medium md:hidden"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      <div id={id} className={open ? 'block' : 'hidden md:block'}>
        {children}
      </div>
    </div>
  );
}
