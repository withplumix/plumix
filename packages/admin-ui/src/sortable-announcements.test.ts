import type { Active, Over } from "@dnd-kit/core";
import { describe, expect, test } from "vitest";

import type { SortableAnnouncements, SortablePosition } from "./sortable.js";
import { dragAnnouncements } from "./sortable-announcements.js";

/** Each string distinct, so a swapped or unwired announcement can't match. */
const announcements: SortableAnnouncements = {
  instructions: "instructions-text",
  pickedUp: ({ position, total }: SortablePosition) =>
    `picked-up ${position}/${total}`,
  movedTo: ({ position, total }: SortablePosition) =>
    `moved-to ${position}/${total}`,
  dropped: ({ position, total }: SortablePosition) =>
    `dropped ${position}/${total}`,
  cancelled: ({ position, total }: SortablePosition) =>
    `cancelled ${position}/${total}`,
};

/** The announcements read only an item's id off what dnd-kit hands them. */
function slot(id: string): Active & Over {
  return { id } as Active & Over;
}

const a = slot("a");
const b = slot("b");

function announcementsForAB() {
  return dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
}

describe("dragAnnouncements", () => {
  test("announces the positions a drag picks up from and drops at", () => {
    const drag = announcementsForAB();

    expect(drag.onDragStart({ active: a })).toBe("picked-up 1/2");
    expect(drag.onDragEnd({ active: a, over: b })).toBe("dropped 2/2");
  });

  test("announces each slot a drag moves to, including the one it started from", () => {
    const drag = announcementsForAB();
    drag.onDragStart({ active: a });

    expect(drag.onDragOver({ active: a, over: a })).toBeUndefined();
    expect(drag.onDragOver({ active: a, over: b })).toBe("moved-to 2/2");
    expect(drag.onDragOver({ active: a, over: a })).toBe("moved-to 1/2");
  });

  test("a cancelled drag announces the position the item returns to", () => {
    const drag = announcementsForAB();
    drag.onDragStart({ active: a });
    drag.onDragOver({ active: a, over: b });

    expect(drag.onDragCancel({ active: a, over: b })).toBe("cancelled 1/2");
  });
});
