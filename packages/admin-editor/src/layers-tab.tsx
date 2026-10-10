import type { DragEndEvent } from "@dnd-kit/core";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Pencil,
  Trash2,
} from "@plumix/admin-ui/icons";
import { resolveLabel } from "@plumix/core/i18n";

import type { FlatNode } from "./block-tree-ops.js";
import { blockExcerpt } from "./block-excerpt.js";
import { BlockIcon } from "./block-icon.js";
import { findBlock, flattenTree, projectMove } from "./block-tree-ops.js";
import { createClipboardOps, pasteableAtRoot } from "./clipboard-ops.js";
import { useEditorConfig } from "./editor-config-context.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";
import { matchesShortcut } from "./shortcuts.js";

const INDENT_WIDTH = 16;

type RowAction = "copy" | "paste" | "duplicate" | "delete";

export function LayersTab(): ReactElement {
  const { registry } = useEditorConfig();
  const { i18n } = useLingui();
  const storeApi = useEditorStoreApi();
  const tree = useEditorStore((s) => s.tree);
  const activeId = useEditorStore((s) => s.activeId);
  const select = useEditorStore((s) => s.select);
  const moveBlock = useEditorStore((s) => s.moveBlock);
  const setBlockLabel = useEditorStore((s) => s.setBlockLabel);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const items = useMemo(() => flattenTree(tree, registry), [tree, registry]);
  // Layers builds its own clipboard ops over the same store/tree as the canvas
  // frame, so copy/paste work from the panel without depending on canvas focus.
  const clipboard = useMemo(
    () =>
      createClipboardOps(
        storeApi,
        registry,
        navigator.clipboard,
        pasteableAtRoot(registry),
      ),
    [storeApi, registry],
  );

  // After a delete, the row that takes the deleted one's place gets focus, so
  // keyboard work through the list carries on instead of falling to the body.
  const treeRef = useRef<HTMLDivElement>(null);
  const focusAfterDelete = useRef<string | null>(null);
  useEffect(() => {
    const id = focusAfterDelete.current;
    if (id === null) return;
    focusAfterDelete.current = null;
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-testid="layer-${id}"]`)
      ?.focus();
  }, [items]);

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
      case "delete": {
        focusAfterDelete.current = rowAfterRemoving(items, id);
        removeSelected();
        break;
      }
    }
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // The block type's display name, the fallback when a node has no instance
  // label.
  const typeLabel = (name: string): string => {
    const spec = registry.get(name);
    return spec?.title != null ? resolveLabel(spec.title, i18n) : name;
  };

  const excerptOf = (id: string): string | null => {
    const node = findBlock(tree, id, registry);
    return node ? blockExcerpt(node, registry.get(node.name)) : null;
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
    <div ref={treeRef} className="p-2" data-testid="layers-tree">
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
              // An author's own label already names the row; otherwise the
              // block's text tells it from others of its type.
              detail={item.label ? null : excerptOf(item.id)}
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
  readonly detail: string | null;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly onRename: (label: string) => void;
  readonly onAction: (action: RowAction) => void;
}

function LayerRow({
  item,
  icon,
  label,
  detail,
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
  // Ending a rename hands focus back to the row it renamed.
  const rowRef = useRef<HTMLButtonElement>(null);
  const refocusRow = useRef(false);
  useEffect(() => {
    if (editing || !refocusRow.current) return;
    refocusRow.current = false;
    rowRef.current?.focus();
  }, [editing]);
  // The menu returns focus to its trigger on close, which would pull it out
  // of the rename input the Rename item just opened.
  const renamingFromMenu = useRef(false);

  const startEditing = (): void => {
    setDraft(item.label ?? "");
    setEditing(true);
  };
  const stopEditing = (): void => {
    refocusRow.current = true;
    setEditing(false);
  };
  const commit = (): void => {
    stopEditing();
    onRename(draft);
  };
  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") stopEditing();
  };
  // Delete/Backspace removes the focused row, matching the canvas; F2 renames
  // it. The handler sits after the drag listeners spread so it owns these keys.
  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (matchesShortcut("selection.delete", event)) {
      event.preventDefault();
      onAction("delete");
    } else if (matchesShortcut("layers.rename", event)) {
      event.preventDefault();
      startEditing();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={
        {
          "--sortable-transform": CSS.Transform.toString(transform),
          "--sortable-transition": transition,
          "--indent": `${String(item.depth * INDENT_WIDTH)}px`,
        } as CSSProperties
      }
      className="plumix-sortable group flex items-center gap-1 ps-(--indent)"
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
            ref={rowRef}
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
            {/* Weight, not a muted colour, sets the text apart: muted fails
                contrast on the selected row's tint. */}
            <span className={detail ? "shrink-0 font-medium" : "truncate"}>
              {label}
            </span>
            {detail ? <span className="truncate">{detail}</span> : null}
          </button>
          <DropdownMenu>
            <span className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100">
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
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </span>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (!renamingFromMenu.current) return;
                renamingFromMenu.current = false;
                event.preventDefault();
              }}
            >
              <DropdownMenuItem
                data-testid={`layer-rename-action-${item.id}`}
                onSelect={() => {
                  renamingFromMenu.current = true;
                  startEditing();
                }}
              >
                <Pencil />
                <Trans id="editor.layers.rename" message="Rename" />
              </DropdownMenuItem>
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
                variant="destructive"
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

// The row that takes `id`'s place once it and its nested rows are gone: the
// next row past its subtree, else the one before it.
function rowAfterRemoving(
  items: readonly FlatNode[],
  id: string,
): string | null {
  const at = items.findIndex((item) => item.id === id);
  if (at === -1) return null;
  const depth = items[at]?.depth ?? 0;
  let next = at + 1;
  while (next < items.length && (items[next]?.depth ?? 0) > depth) next++;
  return items[next]?.id ?? items[at - 1]?.id ?? null;
}
