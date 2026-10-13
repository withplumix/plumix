import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";

import type { SortableAnnouncements, SortablePosition } from "./sortable.js";

/** The dnd-kit announcements a `SortableList` of `items` speaks. */
export function dragAnnouncements(
  items: readonly { readonly id: string }[],
  announcements: SortableAnnouncements,
): Announcements {
  const at = (id: UniqueIdentifier): SortablePosition => ({
    position: items.findIndex((i) => i.id === id) + 1,
    total: items.length,
  });

  // dnd-kit fires `onDragOver` on drag start over the item's own slot, which
  // would talk over "picked up"; speak only on reaching a new slot.
  let announcedOverId: UniqueIdentifier | null = null;
  return {
    onDragStart: ({ active }) => {
      announcedOverId = active.id;
      return announcements.pickedUp(at(active.id));
    },
    onDragOver: ({ over }) => {
      if (!over || over.id === announcedOverId) return undefined;
      announcedOverId = over.id;
      return announcements.movedTo(at(over.id));
    },
    onDragEnd: ({ active, over }) =>
      announcements.dropped(at(over ? over.id : active.id)),
    onDragCancel: ({ active }) => announcements.cancelled(at(active.id)),
  };
}
