import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useMemo } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { Command as CommandPrimitive } from "cmdk";

import type { BlockRegistry, PatternRegistry } from "@plumix/blocks";
import type { Label } from "@plumix/core/i18n";

import type { SlashMenuItem } from "./slash-menu-items.js";
import { entryKey, isVariation } from "./is-variation.js";
import { LazyMount } from "./LazyMount.js";
import { SLASH_THUMBNAIL_MIN_HEIGHT } from "./thumbnail-min-height.js";
import { VariationThumbnail } from "./VariationThumbnail.js";

// Sort-stable sentinel for items missing a category. Compared by
// identity in the bucket Map; the rendered heading uses
// `M.uncategorized` instead so the visible label localizes.
const UNCATEGORIZED = "other";

const M = {
  searchAria: defineMessage({
    id: "slashMenu.searchAria",
    message: "Search blocks and patterns",
  }),
  uncategorized: defineMessage({
    id: "slashMenu.uncategorized",
    message: "Other",
  }),
} satisfies Record<string, MessageDescriptor>;

interface SlashMenuPanelProps {
  readonly items: readonly SlashMenuItem[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (item: SlashMenuItem) => void;
  readonly onDismiss: () => void;
  readonly blocks: BlockRegistry;
  readonly patterns: PatternRegistry;
}

function renderMember(
  item: SlashMenuItem,
  onSelect: (item: SlashMenuItem) => void,
  blocks: BlockRegistry,
  patterns: PatternRegistry,
  renderLabel: (label: Label) => string,
): ReactElement {
  if (item.kind === "pattern") {
    const { entry } = item;
    return (
      <CommandItem
        key={entry.name}
        value={entry.name}
        data-testid={`slash-menu-pattern-card-${entry.name}`}
        onSelect={() => onSelect(item)}
        className="flex flex-col items-start gap-1 px-2 py-2"
      >
        {/* Fixed-aspect strip keeps two-line cards a stable height
            regardless of the author's preview dimensions. The fallback
            is a neutral placeholder — the title below carries the label,
            so doubling it in the strip would just be visual noise. */}
        {entry.preview ? (
          <img
            src={entry.preview.src}
            alt={entry.preview.alt ?? ""}
            className="h-12 w-full rounded object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="bg-muted h-12 w-full rounded"
            data-testid={`slash-menu-pattern-card-placeholder-${entry.name}`}
          />
        )}
        <span className="text-sm font-medium">{renderLabel(entry.title)}</span>
      </CommandItem>
    );
  }
  const { entry } = item;
  const key = entryKey(entry);
  if (isVariation(entry)) {
    return (
      <CommandItem
        key={key}
        value={key}
        data-testid={`slash-menu-item-${key}`}
        onSelect={() => onSelect(item)}
        className="flex flex-col items-start gap-1 px-2 py-2"
      >
        <LazyMount
          placeholderTestId={`slash-menu-thumbnail-placeholder-${entry.name}:${entry.slug}`}
          minHeight={SLASH_THUMBNAIL_MIN_HEIGHT}
        >
          <div
            aria-hidden
            className="pointer-events-none h-12 w-full overflow-hidden rounded"
          >
            <VariationThumbnail
              parentBlockName={entry.name}
              variation={entry}
              blocks={blocks}
              patterns={patterns}
            />
          </div>
        </LazyMount>
        <span className="text-sm font-medium">{renderLabel(entry.title)}</span>
      </CommandItem>
    );
  }
  return (
    <CommandItem
      key={key}
      value={key}
      data-testid={`slash-menu-item-${key}`}
      onSelect={() => onSelect(item)}
      className="flex items-start gap-2"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{renderLabel(entry.title)}</span>
        {entry.description ? (
          <span className="text-muted-foreground text-xs">
            {renderLabel(entry.description)}
          </span>
        ) : null}
      </span>
    </CommandItem>
  );
}

export function SlashMenuPanel({
  items,
  query,
  onQueryChange,
  onSelect,
  onDismiss,
  blocks,
  patterns,
}: SlashMenuPanelProps): ReactElement {
  const label = useLabel();
  const buckets = useMemo(() => {
    const map = new Map<string, SlashMenuItem[]>();
    for (const item of items) {
      const key = item.entry.category ?? UNCATEGORIZED;
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
        aria-label={label(M.searchAria)}
      />
      <CommandList>
        <CommandEmpty data-testid="slash-menu-empty">
          <Trans id="slashMenu.empty" message="No matches" />
        </CommandEmpty>
        {buckets.map(([category, members]) => (
          <CommandGroup
            key={category}
            heading={
              category === UNCATEGORIZED ? label(M.uncategorized) : category
            }
            data-testid={`slash-menu-group-${category}`}
          >
            {members.map((item) =>
              renderMember(item, onSelect, blocks, patterns, label),
            )}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
