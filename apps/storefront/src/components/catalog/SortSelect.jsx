'use client';

import { useRouter } from 'next/navigation';

/** Sort dropdown: navigates to the precomputed URL of each option (built on the server). */
export function SortSelect({ value, options, label }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-9 rounded-md border bg-background px-2"
        value={value}
        onChange={(e) => router.push(options.find((o) => o.value === e.target.value).href)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
