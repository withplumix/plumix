import type { ReactElement } from "react";
import { useMemo } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Command as CommandPrimitive } from "cmdk";

import type { SlashMenuItem } from "./slash-menu-items.js";

interface SlashMenuPanelProps {
  readonly items: readonly SlashMenuItem[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (item: SlashMenuItem) => void;
  readonly onDismiss: () => void;
}

const UNCATEGORIZED = "other";

export function SlashMenuPanel({
  items,
  query,
  onQueryChange,
  onSelect,
  onDismiss,
}: SlashMenuPanelProps): ReactElement {
  const buckets = useMemo(() => {
    const map = new Map<string, SlashMenuItem[]>();
    for (const item of items) {
      const key = item.category ?? UNCATEGORIZED;
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return Array.from(map);
  }, [items]);

  return (
    <Command
      shouldFilter={false}
      data-plumix-slash-menu=""
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDismiss();
        }
      }}
      className="w-72 max-w-full border shadow-md"
    >
      <CommandPrimitive.Input
        value={query}
        onValueChange={onQueryChange}
        data-testid="slash-menu-input"
        autoFocus
        className="sr-only"
        aria-label="Search blocks"
      />
      <CommandList>
        <CommandEmpty data-testid="slash-menu-empty">
          No blocks found
        </CommandEmpty>
        {buckets.map(([category, members]) => (
          <CommandGroup
            key={category}
            heading={category}
            data-testid={`slash-menu-group-${category}`}
          >
            {members.map((item) => (
              <CommandItem
                key={item.slug}
                value={item.slug}
                data-testid={`slash-menu-item-${item.slug}`}
                onSelect={() => onSelect(item)}
                className="flex items-start gap-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.description ? (
                    <span className="text-muted-foreground text-xs">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
