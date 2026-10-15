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

test("insert by click lands at the end, at the start, and beside a block", async ({
  editor,
}) => {
  await editor.create("post");

  const text = await editor.insert("core/rich-text");
  await editor.insert("core/separator");
  await editor.insert("core/code", { at: "start" });
  await editor.insert("core/html", { at: { after: text } });
  await editor.insert("core/separator", { at: { before: text } });

  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/separator",
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

test("insert by drag lands at the end, at the start, beside and into a block", async ({
  editor,
}) => {
  await editor.create("post");

  const separator = await editor.insert("core/separator", { via: "drag" });
  await editor.insert("core/code", { via: "drag" });
  await editor.insert("core/html", { via: "drag", at: "start" });
  await editor.insert("core/rich-text", {
    via: "drag",
    at: { before: separator },
  });
  const section = await editor.insert("core/section", { via: "drag" });
  const nested = await editor.insert("core/separator", {
    via: "drag",
    at: { into: section },
  });

  await expect(nested).toBeAttached();
  expect(await editor.canvas.blocks()).toEqual([
    "core/html",
    "core/rich-text",
    "core/separator",
    "core/code",
    "core/section",
  ]);
});

test("select and the toolbar move a block, climb to its parent and remove it", async ({
  editor,
}) => {
  await editor.create("post");
  const code = await editor.insert("core/code");
  await editor.insert("core/separator");
  const group = await editor.insert("core/group");
  const nested = await editor.insert("core/rich-text", { at: { into: group } });

  await editor.select(code);
  await editor.toolbar.moveDown();
  expect(await editor.canvas.blocks()).toEqual([
    "core/separator",
    "core/code",
    "core/group",
  ]);
  await editor.toolbar.moveUp();
  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/separator",
    "core/group",
  ]);

  await editor.select(nested);
  await editor.toolbar.selectParent();
  await editor.toolbar.remove();

  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
  await expect(nested).toHaveCount(0);
});

test("inspector sets and reads text, number and radio inputs by name", async ({
  editor,
}) => {
  await editor.create("post");
  const rating = await editor.insert("demo/rating");

  await editor.inspector.set("score", 4);
  await editor.inspector.set("symbol", "heart");
  await editor.inspector.set("label", "Worth the trip");

  expect(await editor.inspector.get("score")).toBe(4);
  expect(await editor.inspector.get("symbol")).toBe("heart");
  expect(await editor.inspector.get("label")).toBe("Worth the trip");
  await expect(rating).toContainText("♥♥♥♥ Worth the trip");
});

test("inspector sets and reads select, checkbox, switch and combobox inputs", async ({
  editor,
}) => {
  await editor.create("post");

  await editor.insert("core/columns");
  await editor.inspector.set("stackAt", "never");
  await editor.inspector.set("reverseWhenStacked", true);
  expect(await editor.inspector.get("stackAt")).toBe("never");
  expect(await editor.inspector.get("reverseWhenStacked")).toBe(true);

  await editor.insert("core/details");
  await editor.inspector.set("open", true);
  expect(await editor.inspector.get("open")).toBe(true);

  await editor.insert("core/code");
  await editor.inspector.set("language", "python");
  expect(await editor.inspector.get("language")).toBe("python");
});

test("inspector sets and reads a URL and a media picker", async ({
  editor,
}) => {
  await editor.create("post");
  await editor.insert("media/image");

  await editor.inspector.set("src", "https://example.test/cover.png");
  // The seed's first library row, the showcase post's cover.
  await editor.inspector.set("media", 400);

  expect(await editor.inspector.get("src")).toBe(
    "https://example.test/cover.png",
  );
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

test("richText types, formats and links a text block", async ({ editor }) => {
  await editor.create("post");
  const heading = editor.richText(await editor.insert("core/rich-text"));
  await heading.type("Plumix");
  await heading.format("bold");
  await heading.format("heading-2");
  await heading.link("https://example.test/");

  const list = editor.richText(await editor.insert("core/rich-text"));
  await list.type("First point");
  await list.format("italic");
  await list.format("bullet-list");

  const quote = editor.richText(await editor.insert("core/rich-text"));
  await quote.type("Quoted");
  await quote.format("quote");
  await editor.save();

  const [first, second, third] = await editor.stored();
  expect(first?.attrs?.body).toMatch(
    /^<h2><strong><a href="https:\/\/example\.test\/"[^>]*>Plumix<\/a><\/strong><\/h2>$/,
  );
  expect(second?.attrs?.body).toBe(
    "<ul><li><p><em>First point</em></p></li></ul>",
  );
  expect(third?.attrs?.body).toBe("<blockquote><p>Quoted</p></blockquote>");
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
