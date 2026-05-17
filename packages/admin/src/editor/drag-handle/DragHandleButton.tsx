import type {
  ComponentPropsWithoutRef,
  KeyboardEvent,
  ReactElement,
} from "react";
import { GripVertical } from "lucide-react";

interface DragHandleButtonProps extends ComponentPropsWithoutRef<"div"> {
  readonly onOpenMenu: () => void;
}

/**
 * Visible handle the author clicks / drags. Spreads `...rest` so
 * `<PopoverTrigger asChild>` and `<DragHandle>` (from
 * `@tiptap/extension-drag-handle-react`) can forward their own props
 * onto the same root.
 */
export function DragHandleButton({
  onOpenMenu,
  ...rest
}: DragHandleButtonProps): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenMenu();
    }
  };
  return (
    <div
      {...rest}
      data-testid="drag-handle-button"
      role="button"
      aria-label="Block actions"
      tabIndex={0}
      onClick={onOpenMenu}
      onKeyDown={onKeyDown}
      className="text-muted-foreground hover:text-foreground flex h-6 w-4 cursor-grab items-center justify-center rounded-sm active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </div>
  );
}
