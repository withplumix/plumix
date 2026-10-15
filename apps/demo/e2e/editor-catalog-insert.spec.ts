import { expect, test } from "plumix/test/playwright";

// Every visitor gets their own database, so each test enters the demo first.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
});

test("a catalog click inserts the block right after the selected one", async ({
  editor,
}) => {
  await editor.create("post");
  const code = await editor.insert("core/code");
  await editor.insert("core/separator");

  await editor.insert("core/html", { at: { after: code } });
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/html",
    "core/separator",
  ]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/html" },
    { name: "core/separator" },
  ]);
});

test("a catalog drag to the end appends the block", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/code", { via: "drag" });

  await editor.insert("core/separator", { via: "drag" });
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/separator" },
  ]);
});

test("a catalog drag between two blocks inserts the block there", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/code", { via: "drag" });
  const separator = await editor.insert("core/separator", { via: "drag" });

  await editor.insert("core/html", { via: "drag", at: { before: separator } });
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/html",
    "core/separator",
  ]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/html" },
    { name: "core/separator" },
  ]);
});
