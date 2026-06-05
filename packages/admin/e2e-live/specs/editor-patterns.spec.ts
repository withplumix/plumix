// Pattern flows against the real worker: insert from the Blocks-tab
// patterns section and the slash menu (copy mode), insert + detach a
// reference-mode pattern, author a new pattern via "Copy as pattern
// source", and walk the starter modal that pattern registration
// switches on.

import { expect, test } from "@playwright/test";

import {
  canvasBlocks,
  canvasOrder,
  createPost,
  dismissStarterModal,
  openSlashMenu,
  withAutosave,
} from "./support/editor.js";

test.describe("editor patterns: copy-mode insert", () => {
  test("patterns section click splices the pattern body", async ({ page }) => {
    const id = await createPost(page);

    await withAutosave(page, async () => {
      await page.getByTestId("plumix-patterns-row-e2e/hero").click();
    });
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Pattern heading");
    await expect(
      canvasBlocks(page, "core/rich-text").first().locator("p"),
    ).toHaveText("Pattern body copy");

    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect
      .poll(() => canvasOrder(page))
      .toEqual(["heading", "rich-text"]);
  });

  test("slash menu surfaces the pattern as a card and inserts it", async ({
    page,
  }) => {
    await createPost(page);

    await openSlashMenu(page, "hero");
    const card = page.getByTestId("slash-menu-pattern-card-e2e/hero");
    await expect(card).toBeVisible();
    await withAutosave(page, async () => {
      await card.click();
    });
    await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);
    await expect(canvasBlocks(page, "core/rich-text")).toHaveCount(1);
  });
});

test.describe("editor patterns: reference mode", () => {
  test("reference pattern inserts a ref node that persists as a ref", async ({
    page,
  }) => {
    const id = await createPost(page);

    await withAutosave(page, async () => {
      await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    });
    await expect(
      page.getByTestId("plumix-pattern-ref-e2e/promo"),
    ).toBeVisible();

    // The ref node — not an expanded copy — must be what persists.
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(
      page.getByTestId("plumix-pattern-ref-e2e/promo"),
    ).toBeVisible();
  });

  // KNOWN BROKEN: Puck's [data-puck-dnd] draggable wrapper intercepts
  // pointer events over the whole block — even when it's selected — so
  // the Detach / Open source buttons inside PatternRefPreview can never
  // receive a real mouse click. Rich-text escapes through Puck's
  // overlay portal; the ref preview doesn't.
  test("detach button is reachable with the mouse", async ({ page }) => {
    test.fail();
    await createPost(page);

    await withAutosave(page, async () => {
      await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    });
    const ref = page.getByTestId("plumix-pattern-ref-e2e/promo");
    await ref.click();
    await page
      .getByTestId("plumix-pattern-ref-detach")
      .click({ timeout: 5_000 });
    await expect(ref).toBeHidden();
  });

  // KNOWN BROKEN: even a dispatched DOM click (which sidesteps the
  // hit-testing bug above and verifiably fires on the button) never
  // mutates Puck data — the ref stays put. The pure detachPatternRef
  // helper is unit-covered, so the break sits in the wiring between
  // the overlay-portal render and the usePuck dispatch.
  test("detach action converts the ref into an editable copy", async ({
    page,
  }) => {
    test.fail();
    await createPost(page);

    await withAutosave(page, async () => {
      await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    });
    await expect(
      page.getByTestId("plumix-pattern-ref-e2e/promo"),
    ).toBeVisible();

    await page.getByTestId("plumix-pattern-ref-detach").dispatchEvent("click");
    await expect(page.getByTestId("plumix-pattern-ref-e2e/promo")).toBeHidden({
      timeout: 5_000,
    });
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h3"),
    ).toHaveText("Promo heading");
  });
});

test.describe("editor patterns: authoring", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copy as pattern source serializes the canvas to the clipboard", async ({
    page,
  }) => {
    await createPost(page);
    await withAutosave(page, async () => {
      await page.getByTestId("plumix-patterns-row-e2e/hero").click();
    });

    await page.getByTestId("plumix-editor-copy-as-pattern-source").click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("definePattern({");
    expect(clipboard).toContain('block("core/heading"');
    expect(clipboard).toContain('text: "Pattern heading"');
    expect(clipboard).toContain('block("core/rich-text"');
  });
});

test.describe("editor patterns: starter modal", () => {
  test("fresh entry offers starter patterns; picking one seeds the canvas", async ({
    page,
  }) => {
    await page.goto("entries/posts");
    const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
    await page.getByTestId("content-list-new-button").click();
    await navigated;

    const modal = page.getByTestId("plumix-starter-modal");
    await expect(modal).toBeVisible();
    await withAutosave(page, async () => {
      await page.getByTestId("plumix-starter-modal-card-e2e/hero").click();
    });
    await expect(modal).toBeHidden();
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Pattern heading");
  });

  test("start blank leaves the canvas empty", async ({ page }) => {
    await page.goto("entries/posts");
    const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
    await page.getByTestId("content-list-new-button").click();
    await navigated;

    await dismissStarterModal(page);
    await expect(
      page.getByTestId("plumix-editor-canvas").locator("[data-puck-component]"),
    ).toHaveCount(0);
  });
});
