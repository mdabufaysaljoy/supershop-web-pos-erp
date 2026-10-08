import { PlainTextInput, useFieldControlProps } from '@supershop/ui';
import { X } from 'lucide-react';
import { useState } from 'react';

/**
 * Free-form chips (tags, option values). Enter or comma adds; × removes. Values are trimmed,
 * de-duplicated (case-insensitive) and bounded by `max`.
 * @param {{ value: string[], onChange: (v: string[]) => void, max?: number, maxLength?: number,
 *   placeholder?: string, removeLabel: (item: string) => string, lowercase?: boolean }} props
 */
export function TagInput({
  value,
  onChange,
  max = 30,
  maxLength = 30,
  placeholder,
  removeLabel,
  lowercase = false,
}) {
  const field = useFieldControlProps();
  const [draft, setDraft] = useState('');
  const add = () => {
    const item = (lowercase ? draft.toLowerCase() : draft).trim();
    setDraft('');
    if (!item || value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === item.toLowerCase())) return;
    onChange([...value, item]);
  };
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm"
            >
              {item}
              <button
                type="button"
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={removeLabel(item)}
                onClick={() => onChange(value.filter((v) => v !== item))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PlainTextInput
        {...field}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value.replace(',', ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}
