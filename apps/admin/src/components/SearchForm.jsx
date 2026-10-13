import { PlainTextInput } from '@supershop/ui';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Search box that submits on Enter / button (no request per keystroke). */
export function SearchForm({ initial = '', label, onSearch }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      role="search"
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <PlainTextInput
        type="search"
        value={value}
        maxLength={100}
        aria-label={label}
        placeholder={label}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" variant="outline" size="icon" aria-label={label}>
        <Search className="size-4" aria-hidden />
      </Button>
    </form>
  );
}
