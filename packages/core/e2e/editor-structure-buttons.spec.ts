import type { Locator, Page } from "@playwright/test";

import type { BlockNode } from "@plumix/core/blocks";
import type { Editor } from "@plumix/core/test/playwright";
import { expect, test } from "@plumix/core/test/playwright";

const children = (node: BlockNode | undefined, slot: string): BlockNode[] =>
  (node?.attrs?.[slot] as BlockNode[] | undefined) ?? [];

/** The cells in each row of the canvas table, in order. */
const canvasGrid = (table: Locator): Promise<number[]> =>
  table
    .locator("tr")
    .evaluateAll((rows) => rows.map((row) => row.children.length));

/** The cells in each row of the stored table, in order. */
async function storedGrid(editor: Editor): Promise<number[]> {
  const [table] = await editor.stored();
  return children(table, "rows").map((row) => children(row, "cells").length);
}

/** Every column in the canvas. */
const columnsIn = (editor: Editor): Locator =>
  editor.canvas.frame.locator('[data-plumix-block="core/column"]');

/** Clicks a structure button in the selected block's inspector. */
async function press(page: Page, testId: string): Promise<void> {
  await page.getByTestId("plumix-tab-block").click();
  await page.getByTestId("block-inspector").getByTestId(testId).click();
}

/**
 * Presses `button` on a fresh table, a header row and two body rows of three
 * cells, then checks the canvas, the stored tree and the reloaded canvas.
 */
async function reshapeTable(
  editor: Editor,
  page: Page,
  button: string,
  grid: number[],
): Promise<void> {
  await editor.create("page");
  const table = await editor.insert("core/table");
  await expect.poll(() => canvasGrid(table)).toEqual([3, 3, 3]);

  await press(page, button);
  await expect.poll(() => canvasGrid(table)).toEqual(grid);

  await editor.save();
  await editor.reload();

  expect(await storedGrid(editor)).toEqual(grid);
  await expect
    .poll(() => canvasGrid(editor.canvas.block("core/table")))
    .toEqual(grid);
}

test("add row appends a row to a table", async ({ editor, page }) => {
  await reshapeTable(editor, page, "inspector-add-table-row", [3, 3, 3, 3]);
});

test("remove row drops a table's last row", async ({ editor, page }) => {
  await reshapeTable(editor, page, "inspector-remove-table-row", [3, 3]);
});

test("add column appends a cell to every table row", async ({
  editor,
  page,
}) => {
  await reshapeTable(editor, page, "inspector-add-table-column", [4, 4, 4]);
});

test("remove column drops every table row's last cell", async ({
  editor,
  page,
}) => {
  await reshapeTable(editor, page, "inspector-remove-table-column", [2, 2, 2]);
});

test("add column appends a column to a columns block", async ({
  editor,
  page,
}) => {
  await editor.create("page");
  await editor.insert("core/columns");
  const column = columnsIn(editor);
  await expect(column).toHaveCount(2);

  await press(page, "inspector-add-column");
  await expect(column).toHaveCount(3);

  await editor.save();
  await editor.reload();

  const [columns] = await editor.stored();
  expect(children(columns, "columns").map(({ name }) => name)).toEqual([
    "core/column",
    "core/column",
    "core/column",
  ]);
  await expect(column).toHaveCount(3);
});

test("removing a column leaves the columns block one fewer", async ({
  editor,
}) => {
  await editor.create("page");
  await editor.insert("core/columns");
  const column = columnsIn(editor);
  await editor.select(editor.canvas.block("core/column", 1));

  await editor.toolbar.remove();
  await expect(column).toHaveCount(1);

  await editor.save();
  await editor.reload();

  const [columns] = await editor.stored();
  expect(children(columns, "columns")).toHaveLength(1);
  await expect(column).toHaveCount(1);
});
