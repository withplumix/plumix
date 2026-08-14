import type { useUntitledLabel } from "@/lib/use-untitled-label.js";
import type { ReactNode } from "react";
import { Trans } from "@lingui/react";

import { CommandEmpty, CommandItem } from "@plumix/admin-ui/command";

import type { LookupItem } from "./types.js";

// Shared loading / empty / item-list body for lookup-backed pickers —
// the reference pickers select by `item.id`, the link field's entry
// picker by `item.href`.
export function renderLookupListBody({
  isLoading,
  items,
  testId,
  onSelect,
  untitledLabel,
}: {
  isLoading: boolean;
  items: readonly LookupItem[];
  testId: string;
  onSelect: (item: LookupItem) => void;
  untitledLabel: ReturnType<typeof useUntitledLabel>;
}): ReactNode {
  if (isLoading) {
    return (
      <CommandEmpty>
        <Trans id="metaBox.reference.loading" message="Loading…" />
      </CommandEmpty>
    );
  }
  if (items.length === 0) {
    return (
      <CommandEmpty>
        <Trans id="metaBox.reference.noMatches" message="No matches" />
      </CommandEmpty>
    );
  }
  return items.map((item) => (
    <CommandItem
      key={item.id}
      value={`${item.label ?? ""} ${item.subtitle ?? ""}`}
      onSelect={() => {
        onSelect(item);
      }}
      data-testid={`${testId}-option-${item.id}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          {untitledLabel(item.label, item.targetType)}
        </span>
        {item.subtitle ? (
          <span className="text-muted-foreground text-xs">{item.subtitle}</span>
        ) : null}
      </div>
    </CommandItem>
  ));
}
