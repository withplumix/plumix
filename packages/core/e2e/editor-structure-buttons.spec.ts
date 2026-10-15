import type { Locator, Page } from "@playwright/test";

import type { BlockNode } from "@plumix/core/blocks";
import type { Editor } from "@plumix/core/test/playwright";
import { expect, test } from "@plumix/core/test/playwright";

const children = (node: BlockNode | undefined, slot: string): BlockNode[] =>
  (node?.attrs?.[slot] as BlockNode[] | undefined) ?? [];

const canvasGrid = (table: Locator): Promise<number[]> =>
  table
    .locator("tr")
    .evaluateAll((rows) => rows.map((row) => row.children.length));

async function storedGrid(editor: Editor): Promise<number[]> {
  const [table] = await editor.stored();
  return children(table, "rows").map((row) => children(row, "cells").length);
}

async function press(page: Page, testId: string): Promise<void> {
  await page.getByTestId("plumix-tab-block").click();
  await page.getByTestId("block-inspector").getByTestId(testId).click();
}

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
  await expect(editor.canvas.block("core/column", 1)).toBeVisible();
  await expect(editor.canvas.block("core/column", 2)).toHaveCount(0);

  await press(page, "inspector-add-column");
  await expect(editor.canvas.block("core/column", 2)).toBeVisible();
  await expect(editor.canvas.block("core/column", 3)).toHaveCount(0);

  await editor.save();
  await editor.reload();

  const [columns] = await editor.stored();
  expect(children(columns, "columns").map(({ name }) => name)).toEqual([
    "core/column",
    "core/column",
    "core/column",
  ]);
  await expect(editor.canvas.block("core/column", 2)).toBeVisible();
  await expect(editor.canvas.block("core/column", 3)).toHaveCount(0);
});

test("removing a column leaves the columns block one fewer", async ({
  editor,
}) => {
  await editor.create("page");
  await editor.insert("core/columns");
  await editor.select(editor.canvas.block("core/column", 1));

  await editor.toolbar.remove();
  await expect(editor.canvas.block("core/column", 1)).toHaveCount(0);

  await editor.save();
  await editor.reload();

  const [columns] = await editor.stored();
  expect(children(columns, "columns")).toHaveLength(1);
  await expect(editor.canvas.block("core/column", 0)).toBeVisible();
  await expect(editor.canvas.block("core/column", 1)).toHaveCount(0);
});
