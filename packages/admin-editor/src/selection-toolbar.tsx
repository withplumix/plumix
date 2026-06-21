import type { ReactElement } from "react";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";

import { findParentId } from "./block-tree-ops.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

/** Where to float the toolbar — the active block's box in shell coordinates. */
interface ToolbarBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const TOOLBAR_GAP = 4;

/**
 * Floating actions for the active block: select its container, reorder it among
 * its siblings, duplicate or delete it. Bulk actions (delete/duplicate) act on
 * the whole selection; reorder + select-parent act on the active block. Renders
 * nothing until a block is active.
 */
export function SelectionToolbar({
  box,
}: {
  readonly box: ToolbarBox;
}): ReactElement | null {
  const store = useEditorStoreApi();
  const activeId = useEditorStore((s) => s.activeId);
  const selectedCount = useEditorStore((s) => s.selectedIds.size);
  const hasParent = useEditorStore((s) =>
    s.activeId ? findParentId(s.tree, s.activeId) !== null : false,
  );
  if (!activeId) return null;

  const act = (run: () => void) => (): void => run();
  const state = store.getState();
  // Move + select-parent act on the single active block, so they're ambiguous
  // (and disabled) while several blocks are selected; bulk delete/duplicate
  // stay enabled.
  const multi = selectedCount > 1;

  return (
    <div
      data-testid="plumix-selection-toolbar"
      className="bg-background flex items-center gap-0.5 rounded-md border p-0.5 shadow-sm"
      style={{
        position: "fixed",
        left: box.left,
        top: Math.max(0, box.top - 36 - TOOLBAR_GAP),
        zIndex: 30,
      }}
    >
      {selectedCount > 1 ? (
        <span
          data-testid="selection-toolbar-count"
          className="text-muted-foreground px-1.5 text-xs tabular-nums"
        >
          <Trans
            id="editor.selection.count"
            message="{count} selected"
            values={{ count: selectedCount }}
          />
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="selection-toolbar-select-parent"
        disabled={!hasParent || multi}
        onClick={act(() => state.selectParent())}
      >
        <Trans id="editor.selection.selectParent" message="Select parent" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="selection-toolbar-move-up"
        disabled={multi}
        onClick={act(() => state.moveSelectedBy(-1))}
      >
        <Trans id="editor.selection.moveUp" message="Move up" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="selection-toolbar-move-down"
        disabled={multi}
        onClick={act(() => state.moveSelectedBy(1))}
      >
        <Trans id="editor.selection.moveDown" message="Move down" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="selection-toolbar-duplicate"
        onClick={act(() => state.duplicateSelected())}
      >
        <Trans id="editor.selection.duplicate" message="Duplicate" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="selection-toolbar-delete"
        onClick={act(() => state.removeSelected())}
      >
        <Trans id="editor.selection.delete" message="Delete" />
      </Button>
    </div>
  );
}
