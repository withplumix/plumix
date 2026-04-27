import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input.js";
import { Search } from "lucide-react";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Debounced URL-synced search input shared by admin list screens
 * (/entries/$slug, /users, etc). Local state keeps typing instant; the
 * debounce defers the URL commit (which triggers the RPC refetch) so
 * every keystroke doesn't spawn a query. Parent keys this component on
 * the URL value so external URL changes (back button, deep links) remount
 * with the right initial value instead of needing a setState-in-effect
 * sync.
 */
export function DebouncedSearchInput({
  initialValue,
  placeholder,
  testId,
  onCommit,
}: {
  readonly initialValue: string;
  readonly placeholder: string;
  readonly testId: string;
  readonly onCommit: (next: string | undefined) => void;
}): ReactNode {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (value === initialValue) return;
    const id = setTimeout(() => {
      onCommit(value.length === 0 ? undefined : value);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [value, initialValue, onCommit]);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        role="searchbox"
        value={value}
        maxLength={200}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={testId}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        className="h-9 w-64 pl-9"
      />
    </div>
  );
}
