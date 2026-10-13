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

function labelOf(markup: string, testId: string): string | undefined {
  const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(markup);
  return /aria-label="([^"]*)"/.exec(tag?.[0] ?? "")?.[1];
}

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

    expect(labelOf(markup, "list-row-a-handle")).toBe("reorder-label");
    expect(labelOf(markup, "list-row-a-remove")).toBe("remove-label");
  });
});
