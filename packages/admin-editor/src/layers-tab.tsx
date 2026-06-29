import type { DragEndEvent } from "@dnd-kit/core";
import type { KeyboardEvent, ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trans, useLingui } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import { Button } from "@plumix/admin-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plumix/admin-ui/dropdown-menu";
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  MoreVertical,
  Trash2,
} from "@plumix/admin-ui/icons";
import { resolveLabel } from "@plumix/core/i18n";

import type { FlatNode } from "./block-tree-ops.js";
import { BlockIcon } from "./block-icon.js";
import { flattenTree, projectMove } from "./block-tree-ops.js";
import { createClipboardOps, pasteableAtRoot } from "./clipboard-ops.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

const INDENT_WIDTH = 16;

type RowAction = "copy" | "paste" | "duplicate" | "delete";

interface LayersTabProps {
  /** Resolves a block's display label from its name. */
  readonly registry: BlockRegistry;
}

/**
 * Layers outline: the nested tree as a flat, indented list. Clicking a row
 * selects the block (the canvas overlay follows); dragging reorders and nests
 * via the projection, writing through the store's move action so the canvas
 * reflects it live and it persists.
 */
export function LayersTab({ registry }: LayersTabProps): ReactElement {
  const { i18n } = useLingui();
  const storeApi = useEditorStoreApi();
  const tree = useEditorStore((s) => s.tree);
  const activeId = useEditorStore((s) => s.activeId);
  const select = useEditorStore((s) => s.select);
  const moveBlock = useEditorStore((s) => s.moveBlock);
  const setBlockLabel = useEditorStore((s) => s.setBlockLabel);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const items = useMemo(() => flattenTree(tree), [tree]);
  // Layers builds its own clipboard ops over the same store/tree as the canvas
  // frame, so copy/paste work from the panel without depending on canvas focus.
  const clipboard = useMemo(
    () =>
      createClipboardOps(
        storeApi,
        navigator.clipboard,
        pasteableAtRoot(registry),
      ),
    [storeApi, registry],
  );

  // The store's delete/duplicate/clipboard ops all key off the selection, so a
  // row action selects its block first, then runs the op.
  const runRowAction = (id: string, action: RowAction): void => {
    select(id);
    switch (action) {
      case "copy":
        void clipboard.copy();
        break;
      case "paste":
        void clipboard.paste();
        break;
      case "duplicate":
        duplicateSelected();
        break;
      case "delete":
        removeSelected();
        break;
    }
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // The block type's display name, the fallback when a node has no instance label.
  const typeLabel = (name: string): string => {
    const spec = registry.get(name);
    return spec?.title != null ? resolveLabel(spec.title, i18n) : name;
  };

  if (items.length === 0) {
    return (
      <div
        className="text-muted-foreground p-3 text-sm"
        data-testid="layers-empty"
      >
        <Trans id="editor.layers.empty" message="No blocks yet." />
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const overId = event.over?.id;
    const activeDragId = event.active.id;
    if (overId == null || overId === activeDragId) return;
    // The cumulative horizontal drag offset rides the drag-end event, so no
    // per-move state is needed to know the projected nesting depth.
    const target = projectMove(
      items,
      String(activeDragId),
      String(overId),
      event.delta.x,
      INDENT_WIDTH,
    );
    if (target) moveBlock(String(activeDragId), target);
  };

  return (
    <div className="p-2" data-testid="layers-tree">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <LayerRow
              key={item.id}
              item={item}
              icon={registry.get(item.name)?.icon}
              label={item.label ?? typeLabel(item.name)}
              active={item.id === activeId}
              onSelect={() => select(item.id)}
              onRename={(value) => setBlockLabel(item.id, value)}
              onAction={(action) => runRowAction(item.id, action)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface LayerRowProps {
  readonly item: FlatNode;
  readonly icon?: string;
  readonly label: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  /** Commits a new instance label (empty string clears it). */
  readonly onRename: (label: string) => void;
  readonly onAction: (action: RowAction) => void;
}

function LayerRow({
  item,
  icon,
  label,
  active,
  onSelect,
  onRename,
  onAction,
}: LayerRowProps): ReactElement {
  const { i18n } = useLingui();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const startEditing = (): void => {
    setDraft(item.label ?? "");
    setEditing(true);
  };
  const commit = (): void => {
    setEditing(false);
    onRename(draft);
  };
  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setEditing(false);
  };
  // Delete/Backspace removes the focused row, matching the canvas. The handler
  // sits after the drag listeners spread so it owns these keys.
  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onAction("delete");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingInlineStart: item.depth * INDENT_WIDTH,
      }}
      className="group flex items-center gap-1"
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onRenameKeyDown}
          data-testid={`layer-rename-${item.id}`}
          placeholder={label}
          className="border-input bg-background w-full rounded border p-1 text-sm"
        />
      ) : (
        <>
          <button
            type="button"
            data-testid={`layer-${item.id}`}
            aria-current={active ? "true" : undefined}
            onClick={onSelect}
            onDoubleClick={startEditing}
            className="hover:bg-accent aria-[current]:bg-accent flex min-w-0 flex-1 items-center gap-1.5 rounded p-1.5 text-start text-sm"
            {...attributes}
            {...listeners}
            onKeyDown={onRowKeyDown}
          >
            <BlockIcon
              name={icon}
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="truncate">{label}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid={`layer-menu-${item.id}`}
                aria-label={i18n._({
                  id: "editor.layers.actions",
                  message: "Block actions",
                })}
                className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-testid={`layer-copy-${item.id}`}
                onSelect={() => onAction("copy")}
              >
                <Copy />
                <Trans id="editor.layers.copy" message="Copy" />
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid={`layer-paste-${item.id}`}
                onSelect={() => onAction("paste")}
              >
                <ClipboardPaste />
                <Trans id="editor.layers.paste" message="Paste" />
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid={`layer-duplicate-${item.id}`}
                onSelect={() => onAction("duplicate")}
              >
                <CopyPlus />
                <Trans id="editor.layers.duplicate" message="Duplicate" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid={`layer-delete-${item.id}`}
                onSelect={() => onAction("delete")}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 />
                <Trans id="editor.layers.delete" message="Delete" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
