import { expect, test } from "@plumix/core/test/playwright";

import { code, seedPage } from "./support/seed-page.js";

test("Rename in a row's menu labels its layer", async ({ editor }) => {
  await editor.open(await seedPage([code("first"), code("second")]));
  const second = editor.canvas.block("core/code", 1);

  await editor.layers.rename(second, "Footer snippet");

  await editor.save();
  await editor.reload();
  await expect(await editor.layers.row(second)).toHaveText("Footer snippet");
  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/code"]);
  expect(await editor.stored()).toMatchObject([
    { id: "first" },
    { id: "second", label: "Footer snippet" },
  ]);
});

test("F2 on a focused row renames its layer", async ({ editor, page }) => {
  await editor.open(await seedPage([code("first"), code("second")]));
  const first = editor.canvas.block("core/code", 0);
  await editor.layers.focus(first);

  await page.keyboard.press("F2");
  await page.keyboard.type("Intro snippet");
  await page.keyboard.press("Enter");

  await expect(await editor.layers.row(first)).toBeFocused();
  await editor.save();
  await editor.reload();
  await expect(await editor.layers.row(first)).toHaveText("Intro snippet");
  expect(await editor.stored()).toMatchObject([
    { id: "first", label: "Intro snippet" },
    { id: "second" },
  ]);
});

test("Delete on a focused row removes its block and focuses the next row, so Delete carries on", async ({
  editor,
  page,
}) => {
  await editor.open(
    await seedPage([code("first"), code("second"), code("third")]),
  );
  const first = editor.canvas.block("core/code", 0);
  await editor.layers.focus(first);
  // Looked up before any Delete, while each index still names its block.
  const secondRow = await editor.layers.row(
    editor.canvas.block("core/code", 1),
  );
  const thirdRow = await editor.layers.row(editor.canvas.block("core/code", 2));

  await page.keyboard.press("Delete");

  await expect(secondRow).toBeFocused();
  await page.keyboard.press("Delete");

  await expect(thirdRow).toBeFocused();
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveText("third");
  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  expect(await editor.stored()).toMatchObject([{ id: "third" }]);
});

test("Duplicate in a row's menu puts a copy of its block right after it", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("first"), code("second")]));

  await editor.layers.act(editor.canvas.block("core/code", 0), "duplicate");

  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code", 1)).toHaveText("first");
  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/code",
    "core/code",
  ]);
  const stored = await editor.stored();
  expect(stored).toMatchObject([
    { id: "first", attrs: { text: "first" } },
    { name: "core/code", attrs: { text: "first" } },
    { id: "second" },
  ]);
  expect(stored[1]?.id).not.toBe("first");
});

test("Delete in a row's menu removes its block", async ({ editor }) => {
  await editor.open(await seedPage([code("first"), code("second")]));

  await editor.layers.act(editor.canvas.block("core/code", 0), "delete");

  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveText("second");
  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  expect(await editor.stored()).toMatchObject([{ id: "second" }]);
});

test("Copy in one row's menu and Paste in another's puts the copy after the second", async ({
  editor,
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await editor.open(
    await seedPage([code("first"), code("second"), code("third")]),
  );

  await editor.layers.act(editor.canvas.block("core/code", 0), "copy");
  await editor.layers.act(editor.canvas.block("core/code", 1), "paste");

  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code", 2)).toHaveText("first");
  expect(await editor.stored()).toMatchObject([
    { id: "first" },
    { id: "second" },
    { name: "core/code", attrs: { text: "first" } },
    { id: "third" },
  ]);
});

test("dragging a row onto another moves its block to that row's place", async ({
  editor,
}) => {
  await editor.open(
    await seedPage([code("first"), code("second"), code("third")]),
  );

  await editor.layers.drag(
    editor.canvas.block("core/code", 0),
    editor.canvas.block("core/code", 2),
  );

  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code", 2)).toHaveText("first");
  expect(await editor.stored()).toMatchObject([
    { id: "second" },
    { id: "third" },
    { id: "first" },
  ]);
});
