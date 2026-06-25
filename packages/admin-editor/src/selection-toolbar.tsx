import type { ReactElement, ReactNode } from "react";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerLeftUp,
  GripVertical,
  Group,
  Trash2,
  Ungroup,
} from "@plumix/admin-ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@plumix/admin-ui/tooltip";

import type { OverlayBox } from "./overlay.js";
import {
  canUngroupBlock,
  findParentId,
  selectionRoots,
} from "./block-tree-ops.js";
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
  // Group needs the selected roots to share a parent (a group can't span
  // containers); ungroup needs the active block to actually hold children.
  const canGroup = useEditorStore((s) => {
    const roots = selectionRoots(s.tree, s.selectedIds);
    if (roots.length === 0) return false;
    const parent = findParentId(s.tree, roots[0] ?? "");
    return roots.every((id) => findParentId(s.tree, id) === parent);
  });
  const canUngroup = useEditorStore((s) =>
    s.activeId ? canUngroupBlock(s.tree, s.activeId) : false,
  );
  if (!activeId) return null;

  const act = (run: () => void) => (): void => run();
  const state = store.getState();
  // Move + select-parent act on the single active block, so they're ambiguous
  // (and disabled) while several blocks are selected; bulk delete/duplicate
  // stay enabled.
  const multi = selectedCount > 1;

  return (
    <TooltipProvider delayDuration={300}>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="selection-toolbar-drag"
              aria-label="Drag to move"
              disabled={multi}
              // Pointerdown (not click) starts the move; preventDefault stops
              // the browser's text-selection drag from hijacking it.
              onPointerDown={(e) => {
                e.preventDefault();
                state.startMove(activeId);
              }}
              className="cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <Trans id="editor.selection.drag" message="Drag to move" />
          </TooltipContent>
        </Tooltip>
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
        <IconAction
          testId="selection-toolbar-select-parent"
          icon={<CornerLeftUp className="size-4" />}
          disabled={!hasParent || multi}
          onClick={act(() => state.selectParent())}
          label={
            <Trans id="editor.selection.selectParent" message="Select parent" />
          }
        />
        <IconAction
          testId="selection-toolbar-move-up"
          icon={<ArrowUp className="size-4" />}
          disabled={multi}
          onClick={act(() => state.moveSelectedBy(-1))}
          label={<Trans id="editor.selection.moveUp" message="Move up" />}
        />
        <IconAction
          testId="selection-toolbar-move-down"
          icon={<ArrowDown className="size-4" />}
          disabled={multi}
          onClick={act(() => state.moveSelectedBy(1))}
          label={<Trans id="editor.selection.moveDown" message="Move down" />}
        />
        <IconAction
          testId="selection-toolbar-group"
          icon={<Group className="size-4" />}
          disabled={!canGroup}
          onClick={act(() => state.groupSelected())}
          label={<Trans id="editor.selection.group" message="Group" />}
        />
        {canUngroup ? (
          <IconAction
            testId="selection-toolbar-ungroup"
            icon={<Ungroup className="size-4" />}
            onClick={act(() => state.ungroupSelected())}
            label={<Trans id="editor.selection.ungroup" message="Ungroup" />}
          />
        ) : null}
        <IconAction
          testId="selection-toolbar-duplicate"
          icon={<Copy className="size-4" />}
          onClick={act(() => state.duplicateSelected())}
          label={<Trans id="editor.selection.duplicate" message="Duplicate" />}
        />
        <IconAction
          testId="selection-toolbar-delete"
          icon={<Trash2 className="size-4" />}
          onClick={act(() => state.removeSelected())}
          label={<Trans id="editor.selection.delete" message="Delete" />}
          className="text-destructive hover:text-destructive"
        />
      </div>
    </TooltipProvider>
  );
}

/** A ghost icon button with a tooltip describing the action. */
function IconAction({
  testId,
  icon,
  label,
  disabled,
  onClick,
  className,
}: {
  readonly testId: string;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly className?: string;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid={testId}
          disabled={disabled}
          onClick={onClick}
          className={className}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
