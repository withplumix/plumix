import type { MessageDescriptor } from "@lingui/core";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import type {
  SortableAnnouncements,
  SortablePosition,
} from "@plumix/admin-ui/sortable";

// What a screen reader hears while an author drags a `SortableList` row with
// the keyboard. Positions, never row ids: an id is opaque to the author.
const M = {
  instructions: defineMessage({
    id: "sortable.instructions",
    message:
      "To pick up an item, press space or enter. Use the arrow keys to move it. Press space or enter again to drop it, or escape to cancel.",
  }),
  pickedUp: defineMessage({
    id: "sortable.pickedUp",
    message: "Picked up item {position} of {total}.",
    comment: "position: 1-based place of the item in the list; total: items",
  }),
  movedTo: defineMessage({
    id: "sortable.movedTo",
    message: "Item moved to position {position} of {total}.",
    comment: "position: 1-based place of the item in the list; total: items",
  }),
  dropped: defineMessage({
    id: "sortable.dropped",
    message: "Item dropped at position {position} of {total}.",
    comment: "position: 1-based place of the item in the list; total: items",
  }),
  cancelled: defineMessage({
    id: "sortable.cancelled",
    message:
      "Moving cancelled. Item returned to position {position} of {total}.",
    comment: "position: 1-based place of the item in the list; total: items",
  }),
} satisfies Record<string, MessageDescriptor>;

export function useSortableAnnouncements(): SortableAnnouncements {
  const renderLabel = useLabel();
  const { i18n } = useLingui();
  // Values-bearing descriptors — `useLabel` renders the ICU template
  // literally, so format the position in via `i18n._` directly.
  const at =
    (descriptor: MessageDescriptor) =>
    (values: SortablePosition): string =>
      i18n._(descriptor.id, { ...values }, { message: descriptor.message });
  return {
    instructions: renderLabel(M.instructions),
    pickedUp: at(M.pickedUp),
    movedTo: at(M.movedTo),
    dropped: at(M.dropped),
    cancelled: at(M.cancelled),
  };
}
