import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
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
import { GripVerticalIcon, XIcon } from "lucide-react";

// Generic vertical-list sortable primitive built around dnd-kit. Used
// by `mediaList` / `userList` / `entryList` / repeater rows — any
// place an admin author needs to drag-reorder a small list. Single-
// thumb (no nested drop targets); keyboard reorder works out of the
// box via dnd-kit's `KeyboardSensor` + `sortableKeyboardCoordinates`.

interface SortableListProps<T extends { readonly id: string }> {
  readonly items: readonly T[];
  readonly onReorder: (next: readonly T[]) => void;
  readonly onRemove?: (id: string) => void;
  readonly renderItem: (item: T) => ReactNode;
  readonly disabled?: boolean;
  readonly testId?: string;
}

export function SortableList<T extends { readonly id: string }>({
  items,
  onReorder,
  onRemove,
  renderItem,
  disabled = false,
  testId,
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

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
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
}

function SortableRow({
  id,
  children,
  disabled,
  onRemove,
  testId,
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="border-input bg-background flex items-center gap-2 rounded-md border px-2 py-1.5"
      data-testid={testId}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        aria-label="Reorder"
        data-testid={testId ? `${testId}-handle` : undefined}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onRemove(id);
          }}
          aria-label="Remove"
          data-testid={testId ? `${testId}-remove` : undefined}
        >
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}
