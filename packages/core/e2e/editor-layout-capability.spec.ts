import { resolve } from "node:path";

import type { BlockNode } from "@plumix/core/blocks";
import { factoriesFor } from "@plumix/core/test";
import {
  actingAs,
  dragTo,
  expect,
  openPlaygroundDb,
  test,
} from "@plumix/core/test/playwright";

const TEXT = {
  id: "text",
  name: "core/rich-text",
  attrs: { body: "<p>Draft copy</p>" },
} as const;
const BUTTON = {
  id: "button",
  name: "core/button",
  attrs: { label: "Buy", href: "/buy" },
} as const;
const SEPARATOR = { id: "separator", name: "core/separator" } as const;
const EMPTY_GROUP = {
  id: "group",
  name: "core/group",
  attrs: { content: [] },
} as const;
const BLOCKS: readonly BlockNode[] = [TEXT, BUTTON, SEPARATOR, EMPTY_GROUP];

// A contributor edits their own posts but holds no `entry:post:edit_layout`.
test.beforeEach(async ({ context, editor }) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const { user, storageState } = await actingAs(db, "contributor");
  const post = await factoriesFor(db).entry.create({
    type: "post",
    authorId: user.id,
    content: { version: "plumix.v2", blocks: [...BLOCKS] },
  });
  db.$client.close();
  await context.clearCookies();
  await context.addCookies([...storageState.cookies]);
  await editor.open(post);
});

test("a writer without edit_layout sees no control that changes layout", async ({
  editor,
  page,
}) => {
  await expect(page.getByTestId("plumix-tab-blocks")).toHaveCount(0);
  await expect(page.getByTestId("plumix-tab-styles")).toHaveCount(0);
  await expect(editor.canvas.frame.locator("[data-plumix-add]")).toBeHidden();

  await editor.select(editor.canvas.block("core/button"));

  for (const control of [
    "selection-toolbar-drag",
    "selection-toolbar-move-up",
    "selection-toolbar-move-down",
    "selection-toolbar-group",
    "selection-toolbar-duplicate",
    "selection-toolbar-delete",
  ]) {
    await expect(page.getByTestId(control)).toHaveCount(0);
  }
  await page.getByTestId("layer-menu-button").click();
  await expect(page.getByTestId("layer-rename-action-button")).toBeVisible();
  for (const action of ["copy", "paste", "duplicate", "delete"]) {
    await expect(page.getByTestId(`layer-${action}-button`)).toHaveCount(0);
  }
  await page.keyboard.press("Escape");

  const inspector = page.getByTestId("block-inspector");
  await expect(inspector.getByTestId("block-input-label")).toBeVisible();
  await expect(inspector.getByTestId("block-input-href")).toBeVisible();
  await expect(inspector.getByTestId("block-input-openInNewTab")).toHaveCount(
    0,
  );
});

test("a writer without edit_layout can't drag a block in the layers or the canvas", async ({
  editor,
  page,
}) => {
  const order = [
    "core/rich-text",
    "core/button",
    "core/separator",
    "core/group",
  ];

  // Raw drags: the driver's own `layers.drag` waits for the order to change.
  await page.getByTestId("plumix-tab-layers").click();
  await dragTo(
    page,
    page.getByTestId("layer-text"),
    page.getByTestId("layer-separator"),
  );
  await dragTo(
    page,
    editor.canvas.block("core/rich-text"),
    editor.canvas.block("core/separator"),
  );
  await editor.save();

  expect(await editor.canvas.blocks()).toEqual(order);
  expect((await editor.stored()).map((node) => node.name)).toEqual(order);
});

test("a writer without edit_layout can't select a block with no content inputs", async ({
  page,
}) => {
  await page.getByTestId("plumix-tab-layers").click();
  await page.getByTestId("layer-separator").click();

  await expect(page.getByTestId("plumix-overlay-selected")).toHaveCount(0);
  await expect(page.getByTestId("block-inspector-empty")).toBeVisible();
});

test("a writer without edit_layout edits content in the inspector and saves it", async ({
  editor,
}) => {
  await editor.richText(editor.canvas.block("core/rich-text")).type("Fixed");
  await editor.select(editor.canvas.block("core/button"));
  await editor.inspector.set("label", "Order");
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { id: "text", attrs: { body: expect.stringContaining("Fixed") } },
    { id: "button", attrs: { label: "Order", href: "/buy" } },
    { id: "separator" },
    { id: "group" },
  ]);
});
