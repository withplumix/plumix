import type { Locator, Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
}

/** Clicks a block, so the keys that follow reach the canvas iframe first. */
async function focusCanvas(page: Page, block: Locator): Promise<void> {
  await block.click();
  await expect(page.getByTestId("plumix-canvas-iframe")).toBeFocused();
}

// Every visitor gets their own database, so each test enters the demo first.
test.beforeEach(async ({ page }) => {
  await enterDemo(page);
});

test("undo by keyboard in the canvas takes back the last insert", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await focusCanvas(page, separator);

  await page.keyboard.press("ControlOrMeta+Z");

  await expect(separator).toHaveCount(0);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  expect(await editor.stored()).toMatchObject([{ name: "core/code" }]);
});

test("redo by keyboard in the canvas puts an undone insert back", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await focusCanvas(page, separator);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(separator).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+Z");

  await expect(separator).toBeVisible();
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/separator" },
  ]);
});

test("the toolbar's undo button takes back the last insert", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");

  await page.getByTestId("plumix-undo").click();

  await expect(separator).toHaveCount(0);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  expect(await editor.stored()).toMatchObject([{ name: "core/code" }]);
});

test("the toolbar's redo button puts an undone insert back", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await page.getByTestId("plumix-undo").click();
  await expect(separator).toHaveCount(0);

  await page.getByTestId("plumix-redo").click();

  await expect(separator).toBeVisible();
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/separator" },
  ]);
});

test("Delete in the canvas removes the selected block", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await focusCanvas(page, separator);

  await page.keyboard.press("Delete");

  await expect(separator).toHaveCount(0);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  expect(await editor.stored()).toMatchObject([{ name: "core/code" }]);
});

test("Backspace on the selected layer removes its block", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  const code = await editor.insert("core/code");
  await editor.insert("core/separator");
  await editor.select(code);

  await page.keyboard.press("Backspace");

  await expect(code).toHaveCount(0);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
  expect(await editor.stored()).toMatchObject([{ name: "core/separator" }]);
});

test("Cmd/Ctrl+B in rich text bolds the text and leaves the panels open", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  const block = await editor.insert("core/rich-text");
  await editor.richText(block).type("Plumix");
  const field = page.getByTestId("block-input-body-editor");
  await field.click();
  await page.keyboard.press("ControlOrMeta+A");

  await page.keyboard.press("ControlOrMeta+KeyB");

  await expect(field.locator("strong")).toHaveText("Plumix");
  await expect(block.locator("strong")).toHaveText("Plumix");
  await editor.save();
  await expect(page.getByTestId("plumix-editor-left")).toBeInViewport({
    ratio: 1,
  });
  await editor.reload();
  await expect(
    editor.canvas.block("core/rich-text").locator("strong"),
  ).toHaveText("Plumix");
  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<p><strong>Plumix</strong></p>" } },
  ]);
});

test("Cmd/Ctrl+X in the canvas cuts a block that Cmd/Ctrl+V pastes after the selection", async ({
  editor,
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await editor.create("post");
  const rating = await editor.insert("demo/rating");
  await editor.inspector.set("label", "Cut and pasted");
  const separator = await editor.insert("core/separator");
  // The selected block's toolbar floats over the block above it, so the click
  // that moves focus into the canvas lands on a block that is already selected.
  await editor.select(rating);
  await focusCanvas(page, rating);

  await page.keyboard.press("ControlOrMeta+X");
  await expect(rating).toHaveCount(0);
  await focusCanvas(page, separator);
  await page.keyboard.press("ControlOrMeta+V");

  await expect(editor.canvas.block("demo/rating")).toContainText(
    "Cut and pasted",
  );
  expect(await editor.canvas.blocks()).toEqual([
    "core/separator",
    "demo/rating",
  ]);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual([
    "core/separator",
    "demo/rating",
  ]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/separator" },
    { name: "demo/rating", attrs: { label: "Cut and pasted" } },
  ]);
});
