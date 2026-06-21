import type { ReactElement } from "react";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import { GripVertical } from "@plumix/admin-ui/icons";

import type { OverlayBox } from "./overlay.js";
import { findParentId } from "./block-tree-ops.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

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
  /** The active block's box in the canvas clip layer's local coordinates, so
   *  the toolbar clips to the canvas with the overlays. */
  readonly box: OverlayBox;
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
        position: "absolute",
        left: Math.max(0, box.left),
        top: Math.max(0, box.top - 36 - TOOLBAR_GAP),
        // The enclosing clip layer is pointer-events:none (so overlays don't
        // eat canvas clicks); the toolbar opts back in so its buttons work.
        pointerEvents: "auto",
        zIndex: 30,
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="selection-toolbar-drag"
        aria-label="Drag to move"
        disabled={multi}
        // Pointerdown (not click) starts the move; preventDefault stops the
        // browser's text-selection drag from hijacking it.
        onPointerDown={(e) => {
          e.preventDefault();
          state.startMove(activeId);
        }}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </Button>
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
