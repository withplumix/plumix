import { test as base, expect } from "@plumix/core/test/playwright";

import { openPost, seedFixture } from "./support/seed.js";

const test = base.extend(seedFixture);

const CODE = { id: "code", name: "core/code" } as const;
const SEPARATOR = { id: "separator", name: "core/separator" } as const;

test("undo by keyboard in the canvas takes back the last insert", async ({
  editor,
  page,
  seed,
}) => {
  await openPost(editor, seed, [CODE]);
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
  seed,
}) => {
  await openPost(editor, seed, [CODE]);
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
  seed,
}) => {
  await openPost(editor, seed, [CODE]);
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
  seed,
}) => {
  await openPost(editor, seed, [CODE]);
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
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);
  const separator = editor.canvas.block("core/separator");
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
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);
  const code = editor.canvas.block("core/code");
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
  seed,
}) => {
  await openPost(editor, seed, [
    { id: "text", name: "core/rich-text", attrs: { body: "<p>Plumix</p>" } },
  ]);
  const block = editor.canvas.block("core/rich-text");
  await editor.richText(block).select();

  await page.keyboard.press("ControlOrMeta+KeyB");

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
  seed,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPost(editor, seed, [
    {
      id: "rating",
      name: "playground/rating",
      attrs: { label: "Cut and pasted" },
    },
    SEPARATOR,
  ]);
  const rating = editor.canvas.block("playground/rating");
  await editor.canvas.focus(rating);

  await page.keyboard.press("ControlOrMeta+X");
  await expect(rating).toHaveCount(0);
  await editor.canvas.focus(editor.canvas.block("core/separator"));
  await page.keyboard.press("ControlOrMeta+V");

  await expect(editor.canvas.block("playground/rating")).toContainText(
    "Cut and pasted",
  );
  expect(await editor.canvas.blocks()).toEqual([
    "core/separator",
    "playground/rating",
  ]);
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual([
    "core/separator",
    "playground/rating",
  ]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/separator" },
    { name: "playground/rating", attrs: { label: "Cut and pasted" } },
  ]);
});
