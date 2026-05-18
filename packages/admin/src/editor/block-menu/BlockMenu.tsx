import type { ReactElement } from "react";
import { useMemo } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command.js";
import { Command as CmdkPrimitive } from "cmdk";

import type { BlockRegistry, BlockTransformTo } from "@plumix/blocks";
import { resolveTransformTargets } from "@plumix/blocks";

interface BlockMenuProps {
  readonly sourceName: string;
  readonly blockRegistry: BlockRegistry;
  /**
   * Receives the full transform entry — including `mode` and
   * `mapAttrs` — so the caller can dispatch the right Tiptap command
   * (setNode vs wrapIn) and pre-compute attrs from the source's
   * current state.
   */
  readonly onTransform: (entry: BlockTransformTo) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onCopyJson: () => void;
}

/**
 * Per-block action menu rendered into the popover anchored on the
 * drag handle. Hosts the four canonical actions plus a Transform-to
 * group derived from `resolveTransformTargets`. Native cmdk semantics
 * own keyboard nav + ARIA — same primitive the slash menu uses.
 */
export function BlockMenu({
  sourceName,
  blockRegistry,
  onTransform,
  onDuplicate,
  onDelete,
  onCopyJson,
}: BlockMenuProps): ReactElement {
  const targets = useMemo(
    () => resolveTransformTargets(sourceName, blockRegistry),
    [sourceName, blockRegistry],
  );
  return (
    <Command data-plumix-block-menu="" label="Block actions">
      {/* Hidden cmdk input — gives keyboard-only authors a focus
          target so ArrowDown / Enter route through cmdk. Use the
          primitive directly: shadcn's `CommandInput` wraps the input
          in a div with a SearchIcon that `sr-only` doesn't hide. */}
      <CmdkPrimitive.Input
        className="sr-only"
        tabIndex={-1}
        aria-label="Filter block actions"
        data-plumix-block-menu-input=""
      />
      <CommandList>
        {targets.length > 0 ? (
          <>
            <CommandGroup heading="Transform to">
              {targets.map((entry) => {
                const targetSpec = blockRegistry.get(entry.target);
                if (!targetSpec) return null;
                return (
                  <CommandItem
                    key={entry.target}
                    value={`transform-${entry.target}`}
                    data-testid={`block-menu-transform-${entry.target}`}
                    onSelect={() => onTransform(entry)}
                  >
                    {targetSpec.title}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}
        <CommandGroup heading="Block">
          <CommandItem
            value="duplicate"
            data-testid="block-menu-duplicate"
            onSelect={onDuplicate}
          >
            Duplicate
          </CommandItem>
          <CommandItem
            value="delete"
            data-testid="block-menu-delete"
            onSelect={onDelete}
          >
            Delete
          </CommandItem>
          <CommandItem
            value="copy-json"
            data-testid="block-menu-copy-json"
            onSelect={onCopyJson}
          >
            Copy JSON
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
