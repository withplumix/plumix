import type { Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

/** The richest seeded post, pinned to a fixed id by the seed. */
const SHOWCASE = { type: "post", id: 200 } as const;
const SHOWCASE_SLUG = "typography-and-elements-a-theme-test-sheet";

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
}

// Every visitor gets their own database, so each test enters the demo first.
test.beforeEach(async ({ page }) => {
  await enterDemo(page);
});

test("open shows an existing entry's blocks in the canvas", async ({
  editor,
}) => {
  await editor.open(SHOWCASE);

  await expect(editor.canvas.block("core/table")).toBeVisible();
  expect(await editor.canvas.blocks()).toContain("core/table");
});

test("create starts an entry with an empty canvas", async ({ editor }) => {
  await editor.create("post");

  expect(await editor.canvas.blocks()).toEqual([]);
});

test("insert by click appends the block at the end", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/rich-text");

  await editor.insert("core/separator");

  expect(await editor.canvas.blocks()).toEqual([
    "core/rich-text",
    "core/separator",
  ]);
});

test("insert by click at the start puts the block first", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/rich-text");

  await editor.insert("core/code", { at: "start" });

  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/rich-text"]);
});

test("insert by click after a block puts the block right behind it", async ({
  editor,
}) => {
  await editor.create("post");
  const text = await editor.insert("core/rich-text");
  await editor.insert("core/separator");

  await editor.insert("core/html", { at: { after: text } });

  expect(await editor.canvas.blocks()).toEqual([
    "core/rich-text",
    "core/html",
    "core/separator",
  ]);
});

test("insert by click before a block puts the block right ahead of it", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/rich-text");
  const separator = await editor.insert("core/separator");

  await editor.insert("core/html", { at: { before: separator } });

  expect(await editor.canvas.blocks()).toEqual([
    "core/rich-text",
    "core/html",
    "core/separator",
  ]);
});

test("insert by click into an empty slot nests the block", async ({
  editor,
}) => {
  await editor.create("post");
  const group = await editor.insert("core/group");

  const nested = await editor.insert("core/rich-text", { at: { into: group } });

  await expect(nested).toBeAttached();
  expect(await editor.canvas.blocks()).toEqual(["core/group"]);
});

test("insert by drag appends the block at the end", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/separator", { via: "drag" });

  await editor.insert("core/code", { via: "drag" });

  expect(await editor.canvas.blocks()).toEqual(["core/separator", "core/code"]);
});

test("insert by drag at the start puts the block first", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/separator", { via: "drag" });

  await editor.insert("core/html", { via: "drag", at: "start" });

  expect(await editor.canvas.blocks()).toEqual(["core/html", "core/separator"]);
});

test("insert by drag before a block puts the block right ahead of it", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/code", { via: "drag" });
  const separator = await editor.insert("core/separator", { via: "drag" });

  await editor.insert("core/rich-text", {
    via: "drag",
    at: { before: separator },
  });

  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/rich-text",
    "core/separator",
  ]);
});

test("insert by drag into a block nests the block", async ({ editor }) => {
  await editor.create("post");
  const section = await editor.insert("core/section", { via: "drag" });

  const nested = await editor.insert("core/separator", {
    via: "drag",
    at: { into: section },
  });

  await expect(nested).toBeAttached();
  expect(await editor.canvas.blocks()).toEqual(["core/section"]);
});

test("moveDown swaps the selected block with the one after it", async ({
  editor,
}) => {
  await editor.create("post");
  const code = await editor.insert("core/code");
  await editor.insert("core/separator");
  await editor.select(code);

  await editor.toolbar.moveDown();

  expect(await editor.canvas.blocks()).toEqual(["core/separator", "core/code"]);
});

test("moveUp swaps the selected block with the one before it", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await editor.select(separator);

  await editor.toolbar.moveUp();

  expect(await editor.canvas.blocks()).toEqual(["core/separator", "core/code"]);
});

test("selectParent selects the group around a nested block", async ({
  editor,
  page,
}) => {
  await editor.create("post");
  const group = await editor.insert("core/group");
  const nested = await editor.insert("core/rich-text", { at: { into: group } });
  await editor.select(nested);

  await editor.toolbar.selectParent();

  await expect(page.getByTestId("plumix-overlay-selected")).toHaveAttribute(
    "data-block-id",
    (await group.getAttribute("data-plumix-id")) ?? "",
  );
});

test("remove deletes the selected block", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/code");
  const separator = await editor.insert("core/separator");
  await editor.select(separator);

  await editor.toolbar.remove();

  expect(await editor.canvas.blocks()).toEqual(["core/code"]);
  await expect(separator).toHaveCount(0);
});

test("inspector sets and reads a text input by name", async ({ editor }) => {
  await editor.create("post");
  const rating = await editor.insert("demo/rating");

  await editor.inspector.set("label", "Worth the trip");

  expect(await editor.inspector.get("label")).toBe("Worth the trip");
  await expect(rating).toContainText("Worth the trip");
});

test("inspector sets and reads a number input by name", async ({ editor }) => {
  await editor.create("post");
  const rating = await editor.insert("demo/rating");

  await editor.inspector.set("score", 4);

  expect(await editor.inspector.get("score")).toBe(4);
  await expect(rating).toContainText("★★★★");
});

test("inspector sets and reads a radio input by name", async ({ editor }) => {
  await editor.create("post");
  const rating = await editor.insert("demo/rating");

  await editor.inspector.set("symbol", "heart");

  expect(await editor.inspector.get("symbol")).toBe("heart");
  await expect(rating).toContainText("♥♥♥");
});

test("inspector sets and reads a select input by name", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/columns");

  await editor.inspector.set("stackAt", "never");

  expect(await editor.inspector.get("stackAt")).toBe("never");
});

test("inspector sets and reads a checkbox input by name", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/columns");

  await editor.inspector.set("reverseWhenStacked", true);

  expect(await editor.inspector.get("reverseWhenStacked")).toBe(true);
});

test("inspector sets and reads a switch input by name", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("core/details");

  await editor.inspector.set("open", true);

  expect(await editor.inspector.get("open")).toBe(true);
});

test("inspector sets and reads a combobox input by name", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("core/code");

  await editor.inspector.set("language", "python");

  expect(await editor.inspector.get("language")).toBe("python");
});

test("inspector sets and reads a URL input by name", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("media/image");

  await editor.inspector.set("src", "https://example.test/cover.png");

  expect(await editor.inspector.get("src")).toBe(
    "https://example.test/cover.png",
  );
});

test("inspector sets and reads a media picker by name", async ({ editor }) => {
  await editor.create("post");
  await editor.insert("media/image");

  // The seed's first library row, the showcase post's cover.
  await editor.inspector.set("media", 400);

  expect(await editor.inspector.get("media")).toBe(
    "Cover: Typography & Elements: a theme test sheet",
  );
});

test("save waits until an edit is stored, which reload and stored read back", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("demo/rating");
  await editor.inspector.set("label", "Kept across a reload");

  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual(["demo/rating"]);
  expect(await editor.stored()).toMatchObject([
    { name: "demo/rating", attrs: { label: "Kept across a reload" } },
  ]);
});

test("publish puts a new entry live", async ({ editor, page }) => {
  await editor.create("post");
  await page
    .getByTestId("plumix-editor-title-input")
    .fill("Published through the editor fixture");

  await editor.publish();

  await page.goto("/");
  await expect(
    page
      .getByTestId("post-card")
      .filter({ hasText: "Published through the editor fixture" }),
  ).toBeVisible();
});

test("publish puts a published entry's pending edits live", async ({
  editor,
  page,
}) => {
  await editor.open(SHOWCASE);
  await editor.insert("demo/rating", { at: "start" });
  await editor.inspector.set("label", "Edited after publishing");

  await editor.publish();

  await page.goto(`/posts/${SHOWCASE_SLUG}`);
  await expect(page.getByTestId("post-single")).toContainText(
    "Edited after publishing",
  );
});

test("richText type writes the text into the block", async ({ editor }) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));

  await text.type("Plumix");
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<p>Plumix</p>" } },
  ]);
});

test("richText format bold wraps the text in a strong mark", async ({
  editor,
}) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("Plumix");

  await text.format("bold");
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<p><strong>Plumix</strong></p>" } },
  ]);
});

test("richText format heading-2 turns the paragraph into a heading", async ({
  editor,
}) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("Plumix");

  await text.format("heading-2");
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<h2>Plumix</h2>" } },
  ]);
});

test("richText format bullet-list turns the paragraph into a list", async ({
  editor,
}) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("First point");

  await text.format("bullet-list");
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<ul><li><p>First point</p></li></ul>" } },
  ]);
});

test("richText format quote turns the paragraph into a quote", async ({
  editor,
}) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("Quoted");

  await text.format("quote");
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<blockquote><p>Quoted</p></blockquote>" } },
  ]);
});

test("richText link wraps the text in a link", async ({ editor }) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("Plumix");

  await text.link("https://example.test/");
  await editor.save();

  const [block] = await editor.stored();
  expect(block?.attrs?.body).toMatch(
    /^<p><a href="https:\/\/example\.test\/"[^>]*>Plumix<\/a><\/p>$/,
  );
});

test("richText unlinks a linked text block", async ({ editor }) => {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("Was a link");
  await text.link("https://example.test/");

  await text.unlink();
  await editor.save();

  expect(await editor.stored()).toMatchObject([
    { attrs: { body: "<p>Was a link</p>" } },
  ]);
});

test("a site's own block is inserted, configured and stored", async ({
  editor,
}) => {
  await editor.create("post");

  const rating = await editor.insert("demo/rating");
  await editor.inspector.set("score", 5);
  await editor.inspector.set("symbol", "heart");
  await editor.inspector.set("label", "Would read again");
  await editor.save();

  await expect(rating).toContainText("Would read again");
  expect(await editor.stored()).toMatchObject([
    {
      name: "demo/rating",
      attrs: { score: 5, symbol: "heart", label: "Would read again" },
    },
  ]);
});
