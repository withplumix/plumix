import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { useLingui } from "@lingui/react";

import type {
  BlockNode,
  BlockRegistry,
  InsertableBlockEntry,
} from "@plumix/blocks";
import { Search } from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";
import { resolveLabel } from "@plumix/core/i18n";

import type { InserterPattern } from "./block-catalog.js";
import {
  createNodeFromEntry,
  expandPattern,
  filterPatterns,
  groupInsertables,
} from "./block-catalog.js";
import { BlockIcon } from "./block-icon.js";
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
 * Left-rail inserter: a searchable grid of square icon cards grouped by
 * category, plus a patterns group. Clicking a card appends the block; pressing
 * on one starts a drag the canvas resolves to a positional drop. Patterns are
 * click-insert only (their whole composition appends).
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

  const empty = groups.length === 0 && matchedPatterns.length === 0;

  return (
    <div className="flex flex-col gap-3 p-2" data-testid="block-catalog">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 start-2.5 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={i18n._({
            id: "editor.catalog.searchLabel",
            message: "Search blocks",
          })}
          className="h-9 ps-8"
          data-testid="block-catalog-search"
        />
      </div>

      {empty ? (
        <p
          className="text-muted-foreground px-1 py-4 text-sm"
          data-testid="block-catalog-empty"
        >
          {i18n._({
            id: "editor.catalog.noResults",
            message: "No blocks match your search.",
          })}
        </p>
      ) : null}

      {groups.map((group) => (
        <CatalogGroup
          key={group.category}
          heading={group.category}
          testId={`block-catalog-group-${group.category}`}
        >
          {group.entries.map((entry) => (
            <CatalogCard
              key={entryKey(entry)}
              testId={`block-catalog-item-${entryKey(entry)}`}
              icon={entry.icon}
              label={resolveLabel(entry.title, i18n)}
              onPointerDown={() => startBlockDrag(entry)}
              onClick={() => insertEntry(createNodeFromEntry(registry, entry))}
            />
          ))}
        </CatalogGroup>
      ))}

      {matchedPatterns.length > 0 ? (
        <CatalogGroup
          heading={i18n._({
            id: "editor.catalog.patterns",
            message: "Patterns",
          })}
          testId="block-catalog-patterns"
        >
          {matchedPatterns.map((pattern) => (
            <CatalogCard
              key={pattern.name}
              testId={`block-catalog-pattern-${pattern.name}`}
              label={resolveLabel(pattern.title, i18n)}
              onClick={() => insertPattern(expandPattern(pattern))}
            />
          ))}
        </CatalogGroup>
      ) : null}
    </div>
  );
}

function CatalogGroup({
  heading,
  testId,
  children,
}: {
  readonly heading: string;
  readonly testId: string;
  readonly children: ReactElement[];
}): ReactElement {
  return (
    <div data-testid={testId}>
      <p className="text-muted-foreground mb-1.5 px-1 text-xs font-medium">
        {heading}
      </p>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

/** A square icon card: glyph on top, label below. */
function CatalogCard({
  testId,
  icon,
  label,
  onClick,
  onPointerDown,
}: {
  readonly testId: string;
  readonly icon?: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly onPointerDown?: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={label}
      className="border-border hover:bg-accent hover:border-accent-foreground/20 flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center"
    >
      <BlockIcon name={icon} className="text-muted-foreground size-5" />
      <span className="text-foreground w-full truncate text-[11px] leading-tight">
        {label}
      </span>
    </button>
  );
}

// A stable, collision-free identity for an inserter entry. Variation slugs are
// only unique per parent block (two blocks can both declare `default`), so a
// variation is qualified by its parent name; a bare block (slug === name) keeps
// its name as-is.
function entryKey(entry: InsertableBlockEntry): string {
  return entry.slug === entry.name ? entry.slug : `${entry.name}/${entry.slug}`;
}
