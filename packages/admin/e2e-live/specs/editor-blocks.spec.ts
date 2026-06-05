// Block CRUD against the real worker: insert via palette click and slash
// menu; reorder by dragging on the canvas; duplicate and delete through
// the block actions panel. Every mutation asserts the autosave envelope
// lands (entry/update 200) and — where it guards a regression — that the
// content survives a reload.

import { expect, test } from "@playwright/test";

import {
  canvasBlocks,
  canvasOrder,
  createPost,
  dragBelow,
  insertHeroPattern,
  slashInsert,
  withAutosave,
} from "./support/editor.js";

test.describe("editor blocks: insert", () => {
  test("palette click inserts a block and autosaves it", async ({ page }) => {
    const id = await createPost(page);

    await withAutosave(page, async () => {
      await page.getByTestId("plumix-blocks-tab-item-core/heading").click();
    });
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);

    // Round-trip: the block must come back from the real D1 row.
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);
  });

  // Palette rows are plain click-to-insert buttons today
  // (InsertableEntryRow has no drag source wiring). This pins the gap:
  // when drag-from-palette ships, replace the fixme with a real drag
  // using `dragBelow`-style pointer steps onto the root drop zone.
  test.fixme("palette item drags onto the canvas drop zone", async ({
    page,
  }) => {
    await createPost(page);
    const source = page.getByTestId("plumix-blocks-tab-item-core/separator");
    const dropZone = page.getByTestId("dropzone:root:default-zone");
    await dragBelow(page, source, dropZone);
    await expect(canvasBlocks(page, "core/separator")).toHaveCount(1);
  });

  test("slash menu filters and inserts the matching block", async ({
    page,
  }) => {
    await createPost(page);

    await withAutosave(page, async () => {
      await slashInsert(page, "quote");
    });
    await expect(canvasBlocks(page, "core/quote")).toHaveCount(1);
  });
});

test.describe("editor blocks: arrange", () => {
  test("dragging a block below its sibling reorders the tree", async ({
    page,
  }) => {
    const id = await createPost(page);

    // The e2e/hero pattern gives two visible blocks (heading + rich
    // text) without depending on typing, which has its own spec.
    await insertHeroPattern(page);
    const heading = canvasBlocks(page, "core/heading").first();
    const richText = canvasBlocks(page, "core/rich-text").first();
    await expect(richText).toBeVisible();

    await withAutosave(page, async () => {
      await dragBelow(page, heading, richText);
    });
    // `canvasOrder` reads the DOM without auto-waiting — poll it.
    await expect
      .poll(() => canvasOrder(page))
      .toEqual(["rich-text", "heading"]);

    // Reload: the reorder must have reached the row, not just the store.
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect
      .poll(() => canvasOrder(page))
      .toEqual(["rich-text", "heading"]);
  });

  test("duplicate and delete via the block actions panel", async ({ page }) => {
    await createPost(page);

    await insertHeroPattern(page);
    await canvasBlocks(page, "core/heading").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();

    await withAutosave(page, async () => {
      await page.getByTestId("block-action-duplicate").click();
    });
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(2);

    await canvasBlocks(page, "core/heading").first().click();
    await withAutosave(page, async () => {
      await page.getByTestId("block-action-delete").click();
    });
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);
  });
});
