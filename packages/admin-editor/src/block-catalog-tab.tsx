import type { ReactElement } from "react";
import { useId, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import { Input } from "@plumix/admin-ui/input";
import { resolveLabel } from "@plumix/core/i18n";

import { createBlockFromSpec, groupBlocksByCategory } from "./block-catalog.js";
import { useEditorStore } from "./provider.js";

interface BlockCatalogProps {
  readonly registry: BlockRegistry;
  readonly capabilities: ReadonlySet<string>;
}

/**
 * Left-rail block inserter: a searchable catalog grouped by category. Clicking
 * a block appends it; pressing on one starts a drag the canvas resolves to a
 * positional drop. Both paths go through the store's insert/drag actions, so
 * the live patch loop renders and persists the result.
 */
export function BlockCatalog({
  registry,
  capabilities,
}: BlockCatalogProps): ReactElement {
  const { i18n } = useLingui();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const insertBlock = useEditorStore((s) => s.insertBlock);
  const startBlockDrag = useEditorStore((s) => s.startBlockDrag);
  const treeLength = useEditorStore((s) => s.tree.length);

  const groups = useMemo(
    () => groupBlocksByCategory(registry, { capabilities, query }),
    [registry, capabilities, query],
  );

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="block-catalog">
      <label htmlFor={searchId} className="sr-only">
        <Trans id="editor.catalog.searchLabel" message="Search blocks" />
      </label>
      <Input
        id={searchId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="block-catalog-search"
      />
      {groups.length === 0 ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="block-catalog-empty"
        >
          <Trans
            id="editor.catalog.noResults"
            message="No blocks match your search."
          />
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.category}
            data-testid={`block-catalog-group-${group.category}`}
          >
            <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              {group.category}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {group.blocks.map((spec) => (
                <button
                  key={spec.name}
                  type="button"
                  data-testid={`block-catalog-item-${spec.name}`}
                  className="border-input hover:bg-accent rounded-md border p-2 text-start text-sm"
                  onPointerDown={() => startBlockDrag(spec)}
                  onClick={() =>
                    insertBlock(createBlockFromSpec(spec), treeLength)
                  }
                >
                  {resolveLabel(spec.title ?? spec.name, i18n)}
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
