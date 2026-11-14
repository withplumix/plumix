import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Search } from "@plumix/admin-ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@plumix/admin-ui/input-group";
import { useDebouncedValue } from "@plumix/admin-ui/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Key it on the URL value so external URL changes remount it with the right
 * value.
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
  const settled = useDebouncedValue(value, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (settled === initialValue) return;
    onCommit(settled.length === 0 ? undefined : settled);
  }, [settled, initialValue, onCommit]);

  return (
    <InputGroup className="w-64">
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
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
      />
    </InputGroup>
  );
}
