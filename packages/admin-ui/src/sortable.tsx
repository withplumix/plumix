import type {
  Announcements,
  DragEndEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "./button.js";
import { GripVertical, X } from "./icons.js";
import { cn } from "./utils.js";

// Generic vertical-list sortable primitive built around dnd-kit. Used
// by `mediaList` / `userList` / `entryList` / repeater rows — any
// place an admin author needs to drag-reorder a small list. Single-
// thumb (no nested drop targets); keyboard reorder works out of the
// box via dnd-kit's `KeyboardSensor` + `sortableKeyboardCoordinates`.

// Where an item sits, for a drag announcement: `position` is 1-based.
// Announcements read positions, never item ids, which are opaque to an author.
export interface SortablePosition {
  readonly position: number;
  readonly total: number;
}

// What a screen reader hears while an item is dragged with the keyboard.
export interface SortableAnnouncements {
  readonly instructions: string;
  readonly pickedUp: (at: SortablePosition) => string;
  readonly movedTo: (at: SortablePosition) => string;
  readonly dropped: (at: SortablePosition) => string;
  readonly cancelled: (at: SortablePosition) => string;
}

interface SortableListProps<T extends { readonly id: string }> {
  readonly items: readonly T[];
  readonly onReorder: (next: readonly T[]) => void;
  readonly onRemove?: (id: string) => void;
  readonly renderItem: (item: T) => ReactNode;
  readonly disabled?: boolean;
  readonly testId?: string;
  // Accessible names for the icon-only handle and remove buttons, and the
  // drag announcements; admin-ui carries no catalog, so the caller passes
  // them already localized.
  readonly reorderLabel: string;
  readonly removeLabel: string;
  readonly announcements: SortableAnnouncements;
}

export function SortableList<T extends { readonly id: string }>({
  items,
  onReorder,
  onRemove,
  renderItem,
  disabled = false,
  testId,
  reorderLabel,
  removeLabel,
  announcements,
}: SortableListProps<T>): ReactNode {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove([...items], oldIndex, newIndex));
  };

  const at = (id: UniqueIdentifier): SortablePosition => ({
    position: items.findIndex((i) => i.id === id) + 1,
    total: items.length,
  });

  // dnd-kit fires `onDragOver` as soon as a drag starts, with the item over
  // its own slot; announcing that would talk over "picked up". Speak only
  // when the item reaches a slot other than the last one announced.
  const announcedOverId = useRef<UniqueIdentifier | null>(null);
  const dndAnnouncements: Announcements = {
    onDragStart: ({ active }) => {
      announcedOverId.current = active.id;
      return announcements.pickedUp(at(active.id));
    },
    onDragOver: ({ over }) => {
      if (!over || over.id === announcedOverId.current) return undefined;
      announcedOverId.current = over.id;
      return announcements.movedTo(at(over.id));
    },
    onDragEnd: ({ active, over }) =>
      announcements.dropped(at(over ? over.id : active.id)),
    onDragCancel: ({ active }) => announcements.cancelled(at(active.id)),
  };

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements: dndAnnouncements,
        screenReaderInstructions: { draggable: announcements.instructions },
      }}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-1" data-testid={testId}>
          {items.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              disabled={disabled}
              onRemove={onRemove}
              reorderLabel={reorderLabel}
              removeLabel={removeLabel}
              testId={testId ? `${testId}-row-${item.id}` : undefined}
            >
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  readonly id: string;
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly onRemove?: (id: string) => void;
  readonly testId?: string;
  readonly reorderLabel: string;
  readonly removeLabel: string;
}

function SortableRow({
  id,
  children,
  disabled,
  onRemove,
  testId,
  reorderLabel,
  removeLabel,
}: SortableRowProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={
        {
          "--sortable-transform": CSS.Transform.toString(transform),
          "--sortable-transition": transition,
        } as CSSProperties
      }
      className={cn(
        "plumix-sortable border-input bg-background flex items-center gap-2 rounded-md border px-2 py-1.5",
        isDragging && "opacity-60",
      )}
      data-testid={testId}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        aria-label={reorderLabel}
        data-testid={testId ? `${testId}-handle` : undefined}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove ? (
        <Button
          type="button"
          variant="destructive-row"
          size="icon-sm"
          disabled={disabled}
          onClick={() => {
            onRemove(id);
          }}
          aria-label={removeLabel}
          data-testid={testId ? `${testId}-remove` : undefined}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}
