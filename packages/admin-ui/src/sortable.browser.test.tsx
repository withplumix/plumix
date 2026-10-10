import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { SortableAnnouncements, SortablePosition } from "./sortable.js";
import { SortableList } from "./sortable.js";

interface Item {
  readonly id: string;
}

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

afterEach(cleanup);

function renderList(onReorder = vi.fn()): void {
  render(
    <SortableList<Item>
      items={[{ id: "a" }, { id: "b" }]}
      onReorder={onReorder}
      onRemove={vi.fn()}
      renderItem={(item) => item.id}
      testId="list"
      reorderLabel="reorder-label"
      removeLabel="remove-label"
      announcements={announcements}
    />,
  );
}

describe("SortableList", () => {
  test("the handle and the remove button carry the labels the caller passes", async () => {
    renderList();
    await expect
      .element(page.getByTestId("list-row-a-handle"))
      .toHaveAttribute("aria-label", "reorder-label");
    await expect
      .element(page.getByTestId("list-row-a-remove"))
      .toHaveAttribute("aria-label", "remove-label");
  });

  test("the handle is described by the instructions the caller passes", async () => {
    renderList();
    await expect
      .element(page.getByTestId("list-row-a-handle"))
      .toHaveAccessibleDescription("instructions-text");
  });

  test("a keyboard drag announces the positions it picks up from and drops at", async () => {
    const onReorder = vi.fn();
    renderList(onReorder);
    const body = page.elementLocator(document.body);
    page.getByTestId("list-row-a-handle").element().focus();

    await userEvent.keyboard("[Space]");
    await expect.element(body).toMatchTextContent("picked-up 1/2");

    await userEvent.keyboard("[ArrowDown]");
    await userEvent.keyboard("[Space]");
    await expect.element(body).toMatchTextContent("dropped 2/2");
    expect(onReorder).toHaveBeenCalledWith([{ id: "b" }, { id: "a" }]);
  });

  test("a keyboard drag announces each slot it moves to, including the one it started from", async () => {
    renderList();
    const body = page.elementLocator(document.body);
    page.getByTestId("list-row-a-handle").element().focus();

    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[ArrowDown]");
    await expect.element(body).toMatchTextContent("moved-to 2/2");

    await userEvent.keyboard("[ArrowUp]");
    await expect.element(body).toMatchTextContent("moved-to 1/2");
  });

  test("a drag cancelled with escape announces the position the item returns to", async () => {
    renderList();
    const body = page.elementLocator(document.body);
    page.getByTestId("list-row-a-handle").element().focus();

    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[ArrowDown]");
    await userEvent.keyboard("[Escape]");
    await expect.element(body).toMatchTextContent("cancelled 1/2");
  });
});
