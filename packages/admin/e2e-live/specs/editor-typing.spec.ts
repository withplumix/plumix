// Sustained typing against the real worker. The mock-based admin suite
// can't catch the autosave→refetch→remount loop that ejects focus from
// Tiptap mid-burst (verified live 2026-06-05: 44 slow-typed chars → 0
// persisted), so these are the regression pins for it. The known-broken
// paths carry test.fail() — when a fix lands they flip to "unexpectedly
// passed" and the annotation comes off with it.

import { expect, test } from "@playwright/test";

import {
  canvasBlocks,
  createPost,
  insertHeroPattern,
  withAutosave,
} from "./support/editor.js";

const SENTENCE = "The quick brown fox jumps over the lazy dog";

test.describe("editor typing: fields that commit in one shot", () => {
  test("title input round-trips through autosave", async ({ page }) => {
    const id = await createPost(page);

    await withAutosave(page, async () => {
      await page.getByTestId("plumix-editor-title-input").fill("Typed title");
    });

    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(page.getByTestId("plumix-editor-title-input")).toHaveValue(
      "Typed title",
    );
  });

  test("heading text edits through the inspector field", async ({ page }) => {
    const id = await createPost(page);
    await insertHeroPattern(page);

    await canvasBlocks(page, "core/heading").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    // Puck renders the field without a testid — first text input of the
    // inspector column is the heading's Text field.
    const textField = page
      .getByTestId("plumix-editor-right")
      .locator("input")
      .first();
    await withAutosave(page, async () => {
      await textField.fill("Inspector heading");
    });
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Inspector heading");

    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Inspector heading");
  });
});

test.describe("editor typing: sustained keystrokes", () => {
  test("inspector heading field keeps focus across a typing burst", async ({
    page,
  }) => {
    await createPost(page);
    await insertHeroPattern(page);

    await canvasBlocks(page, "core/heading").first().click();
    const textField = page
      .getByTestId("plumix-editor-right")
      .locator("input")
      .first();
    await textField.click();
    await textField.clear();
    await textField.pressSequentially(SENTENCE, { delay: 50 });
    await expect(textField).toHaveValue(SENTENCE);
    // The full value alone could survive a focus bounce (the locator
    // re-targets per key) — pin that focus actually stayed put.
    await expect(textField).toBeFocused();
  });

  // KNOWN BROKEN: the first autosave round-trip remounts the canvas
  // Tiptap instance and ejects focus to <body>; every keystroke after
  // the remount is dropped (and can land in global hotkey handlers).
  test("inline rich-text typing on the canvas survives autosave", async ({
    page,
  }) => {
    test.fail();
    const id = await createPost(page);
    await insertHeroPattern(page);

    const inline = canvasBlocks(page, "core/rich-text")
      .first()
      .locator('[contenteditable="true"]');
    await inline.click();
    await page.keyboard.press("ControlOrMeta+a");
    await inline.pressSequentially(SENTENCE, { delay: 80 });
    await expect(inline.locator("p")).toHaveText(SENTENCE);

    // And the typed text must reach the row, not just the DOM.
    await withAutosave(page, async () => {
      await page.keyboard.press("End");
    });
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(
      canvasBlocks(page, "core/rich-text").first().locator("p"),
    ).toHaveText(SENTENCE);
  });

  // KNOWN BROKEN: same remount loop through the sidebar Body field.
  test("sidebar Body field typing survives autosave", async ({ page }) => {
    test.fail();
    await createPost(page);
    await insertHeroPattern(page);

    await canvasBlocks(page, "core/rich-text").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    const body = page
      .getByTestId("plumix-editor-right")
      .locator('[contenteditable="true"]')
      .first();
    await body.click();
    await page.keyboard.press("ControlOrMeta+a");
    await body.pressSequentially(SENTENCE, { delay: 80 });
    await expect(body.locator("p")).toHaveText(SENTENCE);
  });
});
