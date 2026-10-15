import type { Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
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
  await editor.canvas.focus(separator);

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
  await editor.canvas.focus(separator);
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
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");

  await editor.undo();

  await expect(separator).toHaveCount(0);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  expect(await editor.stored()).toMatchObject([{ name: "core/code" }]);
});

test("the toolbar's redo button puts an undone insert back", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await editor.undo();
  await expect(separator).toHaveCount(0);

  await editor.redo();

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
  await editor.canvas.focus(separator);

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

test("Cmd/Ctrl+B in rich text bolds the selected text", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  const block = await editor.insert("core/rich-text");
  const text = editor.richText(block);
  await text.type("Plumix");
  await text.select();

  await page.keyboard.press("ControlOrMeta+B");

  await expect(block.locator("strong")).toHaveText("Plumix");
  await editor.save();
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
  await editor.canvas.focus(rating);

  await page.keyboard.press("ControlOrMeta+X");
  await expect(rating).toHaveCount(0);
  await editor.canvas.focus(separator);
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
