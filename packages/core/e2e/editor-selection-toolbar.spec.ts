import AxeBuilder from "@axe-core/playwright";

import { test as base, expect } from "@plumix/core/test/playwright";

import { openPost, seedFixture } from "./support/seed.js";

const test = base.extend(seedFixture);

const CODE = { id: "code", name: "core/code" } as const;
const SEPARATOR = { id: "separator", name: "core/separator" } as const;

test("move up swaps the selected block with the one before it", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);
  await editor.select(editor.canvas.block("core/separator"));

  await editor.toolbar.moveUp();
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual(["core/separator", "core/code"]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/separator" },
    { name: "core/code" },
  ]);
});

test("move down swaps the selected block with the one after it", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);
  await editor.select(editor.canvas.block("core/code"));

  await editor.toolbar.moveDown();
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual(["core/separator", "core/code"]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/separator" },
    { name: "core/code" },
  ]);
});

test("select parent selects the group around a nested block and leaves the content as it was", async ({
  editor,
  page,
  seed,
}) => {
  const groupId = "group";
  await openPost(editor, seed, [
    {
      id: groupId,
      name: "core/group",
      attrs: {
        content: [
          {
            id: "nested",
            name: "core/rich-text",
            attrs: { body: "<p>Plumix</p>" },
          },
        ],
      },
    },
  ]);
  await editor.select(editor.canvas.block("core/rich-text"));

  await editor.toolbar.selectParent();

  await expect(page.getByTestId("plumix-overlay-selected")).toHaveAttribute(
    "data-block-id",
    groupId,
  );
  await editor.save();
  await editor.reload();
  expect(await editor.canvas.blocks()).toEqual(["core/group"]);
  await expect(editor.canvas.block("core/rich-text")).toBeAttached();
  expect(await editor.stored()).toMatchObject([
    {
      id: groupId,
      name: "core/group",
      attrs: { content: [{ name: "core/rich-text" }] },
    },
  ]);
});

test("the selection toolbar has no axe violations", async ({
  editor,
  page,
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);

  await editor.select(editor.canvas.block("core/separator"));

  await expect(page.getByTestId("plumix-selection-toolbar")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="plumix-selection-toolbar"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
