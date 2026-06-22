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
import { resolveLabel } from "@plumix/core/i18n";

import type { FlatNode } from "./block-tree-ops.js";
import { BlockIcon } from "./block-icon.js";
import { flattenTree, projectMove } from "./block-tree-ops.js";
import { useEditorStore } from "./provider.js";

const INDENT_WIDTH = 16;

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
  const tree = useEditorStore((s) => s.tree);
  const activeId = useEditorStore((s) => s.activeId);
  const select = useEditorStore((s) => s.select);
  const moveBlock = useEditorStore((s) => s.moveBlock);
  const setBlockLabel = useEditorStore((s) => s.setBlockLabel);
  const items = useMemo(() => flattenTree(tree), [tree]);
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
}

function LayerRow({
  item,
  icon,
  label,
  active,
  onSelect,
  onRename,
}: LayerRowProps): ReactElement {
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
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingInlineStart: item.depth * INDENT_WIDTH,
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          data-testid={`layer-rename-${item.id}`}
          placeholder={label}
          className="border-input bg-background w-full rounded border p-1 text-sm"
        />
      ) : (
        <button
          type="button"
          data-testid={`layer-${item.id}`}
          aria-current={active ? "true" : undefined}
          onClick={onSelect}
          onDoubleClick={startEditing}
          className="hover:bg-accent aria-[current]:bg-accent flex w-full items-center gap-1.5 rounded p-1.5 text-start text-sm"
          {...attributes}
          {...listeners}
        >
          <BlockIcon
            name={icon}
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="truncate">{label}</span>
        </button>
      )}
    </div>
  );
}
