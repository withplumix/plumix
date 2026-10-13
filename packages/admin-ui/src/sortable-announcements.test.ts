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

describe("dragAnnouncements", () => {
  test("picking an item up announces the position it starts at", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);

    expect(drag.onDragStart({ active: a })).toBe("picked-up 1/2");
  });

  test("dropping an item announces the position it lands at", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);

    expect(drag.onDragEnd({ active: a, over: b })).toBe("dropped 2/2");
  });

  test("the over event over the item's own slot right after pick-up stays silent", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: a });

    expect(drag.onDragOver({ active: a, over: a })).toBeUndefined();
  });

  test("moving to another slot announces it", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: a });

    expect(drag.onDragOver({ active: a, over: b })).toBe("moved-to 2/2");
  });

  test("moving back to the slot it started from announces it", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: a });
    drag.onDragOver({ active: a, over: b });

    expect(drag.onDragOver({ active: a, over: a })).toBe("moved-to 1/2");
  });

  test("a cancelled drag announces the position the item returns to", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: a });
    drag.onDragOver({ active: a, over: b });

    expect(drag.onDragCancel({ active: a, over: b })).toBe("cancelled 1/2");
  });
});
