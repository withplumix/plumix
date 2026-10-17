import type { useUntitledLabel } from "@/lib/use-untitled-label.js";
import type { ReactNode } from "react";

import { CommandEmpty, CommandItem } from "@plumix/admin-ui/command";

import type { LookupItem } from "./types.js";

/**
 * Shared notice / item-list body for lookup-backed pickers — the
 * reference pickers select by `item.id`, the link field's entry picker
 * by `item.href`. `notice` is the rendered `lookupListNotice`.
 */
export function renderLookupListBody({
  notice,
  items,
  testId,
  onSelect,
  untitledLabel,
}: {
  notice: string | null;
  items: readonly LookupItem[];
  testId: string;
  onSelect: (item: LookupItem) => void;
  untitledLabel: ReturnType<typeof useUntitledLabel>;
}): ReactNode {
  if (notice !== null) return <CommandEmpty>{notice}</CommandEmpty>;
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
