import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "plumix/test/playwright";

// Every visitor gets their own database, so each test enters the demo first.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
});

test("move up swaps the selected block with the one before it", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await editor.select(separator);

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
}) => {
  await editor.create("post");
  const code = await editor.insert("core/code");
  await editor.insert("core/separator");
  await editor.select(code);

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
}) => {
  await editor.create("post");
  const group = await editor.insert("core/group");
  const nested = await editor.insert("core/rich-text", { at: { into: group } });
  const groupId = await group.getAttribute("data-plumix-id");
  await editor.select(nested);

  await editor.toolbar.selectParent();

  await expect(page.getByTestId("plumix-overlay-selected")).toHaveAttribute(
    "data-block-id",
    groupId ?? "",
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
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");

  await editor.select(separator);

  await expect(page.getByTestId("plumix-selection-toolbar")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="plumix-selection-toolbar"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
