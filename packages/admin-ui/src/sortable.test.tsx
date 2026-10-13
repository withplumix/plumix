import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { SortableAnnouncements } from "./sortable.js";
import { SortableList } from "./sortable.js";

const announcements: SortableAnnouncements = {
  instructions: "instructions-text",
  pickedUp: () => "",
  movedTo: () => "",
  dropped: () => "",
  cancelled: () => "",
};

describe("SortableList", () => {
  test("the handle and the remove button carry the labels the caller passes", () => {
    const markup = renderToStaticMarkup(
      <SortableList
        items={[{ id: "a" }]}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        renderItem={(item) => item.id}
        testId="list"
        reorderLabel="reorder-label"
        removeLabel="remove-label"
        announcements={announcements}
      />,
    );

    expect(markup).toContain(
      'aria-label="reorder-label" data-testid="list-row-a-handle"',
    );
    expect(markup).toContain(
      'aria-label="remove-label" data-testid="list-row-a-remove"',
    );
  });
});
