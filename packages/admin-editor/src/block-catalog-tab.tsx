import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { useLingui } from "@lingui/react";

import type {
  BlockNode,
  BlockRegistry,
  InsertableBlockEntry,
} from "@plumix/blocks";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@plumix/admin-ui/command";
import { resolveLabel } from "@plumix/core/i18n";

import type { InserterPattern } from "./block-catalog.js";
import {
  createNodeFromEntry,
  expandPattern,
  filterPatterns,
  groupInsertables,
} from "./block-catalog.js";
import { useEditorStore } from "./provider.js";

interface BlockCatalogProps {
  readonly registry: BlockRegistry;
  readonly capabilities: ReadonlySet<string>;
  /** Theme + plugin patterns offered alongside the blocks (click-insert). */
  readonly patterns?: readonly InserterPattern[];
  /** Called after any click-insert, so a host popover can close itself. */
  readonly onInsert?: () => void;
}

/**
 * Left-rail inserter built on shadcn's Command: a searchable list of blocks
 * (and their inserter variations) grouped by category, plus a patterns group.
 * Selecting a block appends it; pressing on one starts a drag the canvas
 * resolves to a positional drop. Patterns are click-insert only (their whole
 * composition appends). Filtering is ours (capabilities + variation expansion),
 * so Command runs with `shouldFilter={false}`.
 */
export function BlockCatalog({
  registry,
  capabilities,
  patterns,
  onInsert,
}: BlockCatalogProps): ReactElement {
  const { i18n } = useLingui();
  const [query, setQuery] = useState("");
  const insertBlock = useEditorStore((s) => s.insertBlock);
  const insertBlocks = useEditorStore((s) => s.insertBlocks);
  const startBlockDrag = useEditorStore((s) => s.startBlockDrag);
  const treeLength = useEditorStore((s) => s.tree.length);

  const groups = useMemo(
    () => groupInsertables(registry, { capabilities, query }),
    [registry, capabilities, query],
  );
  const matchedPatterns = useMemo(
    () => filterPatterns(patterns ?? [], query),
    [patterns, query],
  );

  const insertEntry = (node: BlockNode): void => {
    insertBlock(node, treeLength);
    onInsert?.();
  };
  const insertPattern = (nodes: readonly BlockNode[]): void => {
    insertBlocks(nodes, treeLength);
    onInsert?.();
  };

  return (
    <Command
      shouldFilter={false}
      className="bg-transparent"
      data-testid="block-catalog"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        aria-label={i18n._({
          id: "editor.catalog.searchLabel",
          message: "Search blocks",
        })}
        data-testid="block-catalog-search"
      />
      <CommandList className="max-h-none">
        <CommandEmpty data-testid="block-catalog-empty">
          {i18n._({
            id: "editor.catalog.noResults",
            message: "No blocks match your search.",
          })}
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup
            key={group.category}
            heading={group.category}
            data-testid={`block-catalog-group-${group.category}`}
          >
            {group.entries.map((entry) => (
              <CommandItem
                key={entryKey(entry)}
                value={entryKey(entry)}
                data-testid={`block-catalog-item-${entryKey(entry)}`}
                onPointerDown={() => startBlockDrag(entry)}
                onSelect={() =>
                  insertEntry(createNodeFromEntry(registry, entry))
                }
              >
                {resolveLabel(entry.title, i18n)}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {matchedPatterns.length > 0 && (
          <CommandGroup
            heading={i18n._({
              id: "editor.catalog.patterns",
              message: "Patterns",
            })}
            data-testid="block-catalog-patterns"
          >
            {matchedPatterns.map((pattern) => (
              <CommandItem
                key={pattern.name}
                value={`pattern:${pattern.name}`}
                data-testid={`block-catalog-pattern-${pattern.name}`}
                onSelect={() => insertPattern(expandPattern(pattern))}
              >
                {resolveLabel(pattern.title, i18n)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

// A stable, collision-free identity for an inserter entry. Variation slugs are
// only unique per parent block (two blocks can both declare `default`), so a
// variation is qualified by its parent name; a bare block (slug === name) keeps
// its name as-is.
function entryKey(entry: InsertableBlockEntry): string {
  return entry.slug === entry.name ? entry.slug : `${entry.name}/${entry.slug}`;
}
