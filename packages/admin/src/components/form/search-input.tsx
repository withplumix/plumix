import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Search } from "@plumix/admin-ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@plumix/admin-ui/input-group";

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
