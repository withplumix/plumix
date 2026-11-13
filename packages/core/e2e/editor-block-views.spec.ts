import type { Page } from "@playwright/test";

import type { BlockNode } from "@plumix/core/blocks";
import { test as base, expect } from "@plumix/core/test/playwright";

import type { Seed } from "./support/seed.js";
import { openPost, seedFixture } from "./support/seed.js";

const test = base.extend(seedFixture);

const SHOWCASE = { id: "showcase", name: "playground/showcase" } as const;

/** A published post of `blocks`, and the path its public page serves at. */
async function publishedPost(
  seed: Seed,
  blocks: readonly BlockNode[],
): Promise<string> {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
    status: "published",
    content: { version: "plumix.v2", blocks: [...blocks] },
  });
  return `/posts/${post.slug}`;
}

test("a view's stylesheet and island render in the canvas", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [SHOWCASE]);
  const block = editor.canvas.block("playground/showcase");

  await expect(block.getByTestId("showcase-text")).toHaveText("Showcase view");
  await expect(block.getByTestId("showcase")).toHaveCSS(
    "border-top-color",
    "rgb(255, 0, 0)",
  );
  await expect(block.getByTestId("showcase-clicker")).toHaveText("0");
});

test("a view's island responds in the canvas", async ({ editor, seed }) => {
  await openPost(editor, seed, [SHOWCASE]);
  const clicker = editor.canvas
    .block("playground/showcase")
    .getByTestId("showcase-clicker");

  await clicker.click();

  await expect(clicker).toHaveText("1");
});

test("the public page hydrates the view's island", async ({ page, seed }) => {
  const path = await publishedPost(seed, [SHOWCASE]);
  await page.goto(path);
  const clicker = page.getByTestId("showcase-clicker");

  // An interaction island: the click that hydrates it lands once.
  await clicker.click();

  await expect(clicker).toHaveAttribute("data-live");
  await expect(clicker).toHaveText("1");
});

/** A showcase whose loader counts the posts of the test's own author. */
function authorShowcase(seed: Seed): BlockNode {
  return { ...SHOWCASE, attrs: { authorId: seed.authorId } };
}

test("a block's loader data shows in the canvas", async ({ editor, seed }) => {
  await openPost(editor, seed, [authorShowcase(seed)]);

  await expect(
    editor.canvas.block("playground/showcase").getByTestId("showcase-posts"),
  ).toHaveText("1 posts");
});

test("Refresh re-runs a block's loader", async ({ editor, page, seed }) => {
  await openPost(editor, seed, [authorShowcase(seed)]);
  const block = editor.canvas.block("playground/showcase");
  const posts = block.getByTestId("showcase-posts");
  await expect(posts).toHaveText("1 posts");
  await seed.factories.entry.create({ type: "post", authorId: seed.authorId });
  await editor.select(block);

  await page.getByTestId("refresh-block-loader").click();

  await expect(posts).toHaveText("2 posts");
});

test("a block inserted from the catalog shows its view at once", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [{ id: "code", name: "core/code" }]);

  const inserted = await editor.insert("playground/showcase");

  await expect(inserted.getByTestId("showcase-text")).toHaveText(
    "Showcase view",
  );
  await expect(
    editor.canvas.frame.getByTestId("block-unregistered"),
  ).toHaveCount(0);
});

/** Records the block names each `host:prefetch-blocks` message names. */
async function recordPrefetches(page: Page): Promise<() => Promise<unknown>> {
  const handle = await page.getByTestId("plumix-canvas-iframe").elementHandle();
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("The canvas iframe has no frame.");
  await frame.evaluate(() => {
    const seen: unknown[] = [];
    Object.assign(window, { prefetched: seen });
    window.addEventListener("message", (event: MessageEvent) => {
      const { message } = event.data as {
        message?: { type?: string; names?: unknown };
      };
      if (message?.type === "host:prefetch-blocks") seen.push(message.names);
    });
  });
  return () =>
    frame.evaluate(
      () => (window as unknown as { prefetched: unknown[] }).prefetched,
    );
}

test("hovering a catalog item prefetches its block's view", async ({
  editor,
  page,
  seed,
}) => {
  await openPost(editor, seed, [{ id: "code", name: "core/code" }]);
  const prefetched = await recordPrefetches(page);
  await page.getByTestId("plumix-tab-blocks").click();

  await page.getByTestId("block-catalog-item-playground/showcase").hover();

  await expect.poll(prefetched).toEqual([["playground/showcase"]]);
});

test("focusing a catalog item prefetches its block's view", async ({
  editor,
  page,
  seed,
}) => {
  await openPost(editor, seed, [{ id: "code", name: "core/code" }]);
  const prefetched = await recordPrefetches(page);
  await page.getByTestId("plumix-tab-blocks").click();

  await page.getByTestId("block-catalog-item-playground/showcase").focus();

  await expect.poll(prefetched).toEqual([["playground/showcase"]]);
});

const HIGHLIGHTED_CODE = {
  id: "highlighted",
  name: "core/code",
  attrs: { text: "const answer = 42;", language: "javascript" },
} as const;
const HIGHLIGHTED_HTML =
  '<span class="hljs-keyword">const</span> answer = <span class="hljs-number">42</span>;';

test("a code block highlights in the editor", async ({ editor, seed }) => {
  await openPost(editor, seed, [HIGHLIGHTED_CODE]);

  await expect(
    editor.canvas.block("core/code").getByTestId("code-highlighted"),
  ).toHaveJSProperty("innerHTML", HIGHLIGHTED_HTML);
});

const UNSAFE_HTML = {
  id: "unsafe",
  name: "core/html",
  attrs: { html: "<p>kept</p><script>window.pwned = true;</script>" },
} as const;

test("an HTML block sanitizes in the editor", async ({ editor, seed }) => {
  await openPost(editor, seed, [UNSAFE_HTML]);

  await expect(
    editor.canvas.block("core/html").getByTestId("html-block"),
  ).toHaveJSProperty("innerHTML", "<p>kept</p>");
});
