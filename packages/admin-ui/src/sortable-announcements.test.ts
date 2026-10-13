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

describe("dragAnnouncements", () => {
  test("picking an item up announces the position it starts at", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);

    expect(drag.onDragStart({ active: { id: "a" } as Active })).toBe(
      "picked-up 1/2",
    );
  });

  test("dropping an item announces the position it lands at", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);

    expect(
      drag.onDragEnd({
        active: { id: "a" } as Active,
        over: { id: "b" } as Over,
      }),
    ).toBe("dropped 2/2");
  });

  test("the over event over the item's own slot right after pick-up stays silent", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: { id: "a" } as Active });

    expect(
      drag.onDragOver({
        active: { id: "a" } as Active,
        over: { id: "a" } as Over,
      }),
    ).toBeUndefined();
  });

  test("moving to another slot announces it", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: { id: "a" } as Active });

    expect(
      drag.onDragOver({
        active: { id: "a" } as Active,
        over: { id: "b" } as Over,
      }),
    ).toBe("moved-to 2/2");
  });

  test("moving back to the slot it started from announces it", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: { id: "a" } as Active });
    drag.onDragOver({
      active: { id: "a" } as Active,
      over: { id: "b" } as Over,
    });

    expect(
      drag.onDragOver({
        active: { id: "a" } as Active,
        over: { id: "a" } as Over,
      }),
    ).toBe("moved-to 1/2");
  });

  test("a cancelled drag announces the position the item returns to", () => {
    const drag = dragAnnouncements([{ id: "a" }, { id: "b" }], announcements);
    drag.onDragStart({ active: { id: "a" } as Active });
    drag.onDragOver({
      active: { id: "a" } as Active,
      over: { id: "b" } as Over,
    });

    expect(
      drag.onDragCancel({
        active: { id: "a" } as Active,
        over: { id: "b" } as Over,
      }),
    ).toBe("cancelled 1/2");
  });
});
