import type { ReactElement } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import { Button } from "@plumix/admin-ui/button";
import { Plus } from "@plumix/admin-ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@plumix/admin-ui/popover";

import type { InserterPattern } from "./block-catalog.js";
import { BlockCatalog } from "./block-catalog-tab.js";

interface BlockInserterPopoverProps {
  readonly registry: BlockRegistry;
  readonly capabilities: ReadonlySet<string>;
  readonly patterns?: readonly InserterPattern[];
}

/**
 * Toolbar "+ Add Block" affordance: a popover hosting the same catalog as the
 * left rail, so blocks, variations and patterns are insertable without the
 * sidebar. Closes itself once something is inserted.
 */
export function BlockInserterPopover({
  registry,
  capabilities,
  patterns,
}: BlockInserterPopoverProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="plumix-add-block"
        >
          <Plus />
          <Trans id="editor.toolbar.addBlock" message="Add Block" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-80 overflow-auto p-0"
        data-testid="plumix-add-block-popover"
      >
        <BlockCatalog
          registry={registry}
          capabilities={capabilities}
          patterns={patterns}
          onInsert={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
