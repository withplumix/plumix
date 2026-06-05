import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

// The playground registers a starter-eligible pattern (`e2e/hero`,
// `target: "post-content"`), so every freshly created entry opens the
// starter modal. Specs that aren't about the modal start blank.
export async function dismissStarterModal(page: Page): Promise<void> {
  const modal = page.getByTestId("plumix-starter-modal");
  await modal.waitFor({ state: "visible" });
  await page.getByTestId("plumix-starter-modal-start-blank").click();
  await expect(modal).toBeHidden();
}

/**
 * Create a fresh draft post through the real UI (list → New → editor
 * redirect) and land in the editor with the starter modal dismissed.
 * Returns the entry id parsed from the edit URL.
 */
export async function createPost(page: Page): Promise<number> {
  // Retried because parallel workers can collide on entry.create:
  // create.tsx derives the slug from Date.now(), so two same-millisecond
  // creates 409 (`slug_taken`) — and the route has no onError, leaving
  // "Creating…" up forever. The silent hang has its own regression test
  // in editor-lifecycle.spec.ts; the retry here keeps unrelated specs
  // from inheriting the flake.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("entries/posts");
    const navigated = page
      .waitForURL(/\/entries\/posts\/\d+\/edit/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    await page.getByTestId("content-list-new-button").click();
    if (await navigated) {
      await dismissStarterModal(page);
      const match = /\/entries\/posts\/(\d+)\/edit/.exec(page.url());
      if (!match) throw new Error(`expected an edit URL, got ${page.url()}`);
      return Number(match[1]);
    }
  }
  throw new Error("createPost: entry.create kept failing after 3 attempts");
}

/**
 * Arm an `entry/update` response waiter, run the action, and wait for
 * the editor's keystroke-debounced autosave to land. Arming BEFORE the
 * action means a fast RPC can't slip past the waiter.
 *
 * Contract: the action must actually dirty the title or content — the
 * editor dedups no-op saves against its last-saved snapshot, so a
 * non-mutating action never produces an `entry/update` and the waiter
 * times out. With back-to-back calls the waiter can also match the
 * previous call's trailing save; follow with a web-first assertion on
 * the mutated state, never on the response alone.
 */
export async function withAutosave(
  page: Page,
  action: () => Promise<void>,
): Promise<void> {
  const updated = page.waitForResponse(
    (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    { timeout: 15_000 },
  );
  await action();
  await updated;
}

/**
 * Reorder drag for Puck's canvas (@dnd-kit/react, mouse sensor with a
 * 5 px distance activation). HTML5 dragTo() doesn't fire pointer
 * events, so this walks the cursor: down on the source, a short
 * vertical move to clear the activation distance, a settle pause for
 * the drag to engage, a stepped glide past the target's far edge,
 * another settle for the collision detector, then up.
 */
export async function dragBelow(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dragBelow: source or target has no bounding box");
  }
  const x = sourceBox.x + Math.min(40, sourceBox.width / 2);
  const startY = sourceBox.y + sourceBox.height / 2;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY + 10, { steps: 4 });
  await page.waitForTimeout(300);
  // Overshoot deep past the target's bottom edge — zoomed-out canvas
  // blocks can be ~15 px tall, and near-edge drops resolve back to the
  // source's original slot (a silent no-op). The collision detector
  // clamps an overshoot to "after the last item", so this helper is
  // meant for dropping after the zone's trailing block.
  await page.mouse.move(x, targetBox.y + targetBox.height + 100, {
    steps: 12,
  });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

// Puck exposes only the item id on `data-puck-component` (pattern
// inserts mint bare random ids), so block type is asserted through the
// semantic element each core block renders — which doubles as checking
// the block actually renders its markup.
const BLOCK_DOM: Record<string, string> = {
  "core/heading": "h1, h2, h3, h4, h5, h6",
  "core/rich-text": ".rich-text",
  "core/quote": "blockquote",
  "core/separator": "hr",
};

/** Canvas-rendered block wrappers for a given block name. */
export function canvasBlocks(page: Page, name: string): Locator {
  const selector = BLOCK_DOM[name];
  if (!selector) throw new Error(`canvasBlocks: no DOM mapping for ${name}`);
  return page
    .getByTestId("plumix-editor-canvas")
    .locator("[data-puck-component]")
    .filter({ has: page.locator(selector) });
}

/** Top-level canvas block order as semantic names, for reorder asserts. */
export async function canvasOrder(page: Page): Promise<readonly string[]> {
  return page
    .getByTestId("plumix-editor-canvas")
    .locator("[data-puck-component]")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        if (node.querySelector("h1, h2, h3, h4, h5, h6")) return "heading";
        if (node.querySelector(".rich-text")) return "rich-text";
        if (node.querySelector("blockquote")) return "quote";
        if (node.querySelector("hr")) return "separator";
        return "unknown";
      }),
    );
}

/** Open the slash menu from the canvas and type a filter into it. */
export async function openSlashMenu(page: Page, filter: string): Promise<void> {
  await page.getByTestId("plumix-editor-canvas").focus();
  await page.keyboard.press("/");
  await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
  await page.keyboard.type(filter);
}

/** Insert a block through the slash menu, the keyboard-first path. */
export async function slashInsert(page: Page, filter: string): Promise<void> {
  await openSlashMenu(page, filter);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
}

/** Insert the e2e/hero pattern (heading + rich text) and await autosave. */
export async function insertHeroPattern(page: Page): Promise<void> {
  await withAutosave(page, async () => {
    await page.getByTestId("plumix-patterns-row-e2e/hero").click();
  });
  await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);
  // Let the autosave response's state echo settle — a canvas re-render
  // mid-drag cancels @dnd-kit's drag, so callers that drag right after
  // inserting would flake without this.
  await page.waitForTimeout(800);
}
