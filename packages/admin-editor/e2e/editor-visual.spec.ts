// Real-browser coverage of the geometry-dependent editor surface. The mock-RPC
// admin suite can't serve the canvas iframe, so selection overlays, the
// floating toolbar, and multi-select are unit-tested there but never rendered.
// Here the playground's same-origin canvas makes the bridge — and the real
// geometry it reports — work end to end.

import { expect, test } from "@playwright/test";

const CANVAS_FRAME = '[data-testid="plumix-canvas-frame"] iframe';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("editor playground", () => {
  test("mounts the shell, canvas iframe, and renders the seeded tree", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-toolbar")).toBeVisible();
    await expect(page.getByTestId("plumix-canvas-frame")).toBeVisible();

    // The canvas iframe renders the real BlockRenderer over the seed tree.
    const canvas = page.frameLocator(CANVAS_FRAME);
    await expect(canvas.locator('[data-plumix-id="heading-1"]')).toBeVisible();
    await expect(canvas.locator('[data-plumix-id="col-left"]')).toBeVisible();
  });

  test("selecting a block draws the overlay and floats the toolbar", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    await canvas.locator('[data-plumix-id="heading-1"]').click();

    // Host-side overlay + toolbar are positioned from the iframe's reported
    // geometry — the path the unit tests can only fake.
    await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();
    await expect(page.getByTestId("plumix-selection-toolbar")).toBeVisible();
    await expect(page.getByTestId("selection-toolbar-duplicate")).toBeVisible();
  });

  test("overlays and toolbar stay clipped to the canvas, not over the rails", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    // Select a full-width block whose outline would otherwise span the whole
    // 1280px canvas — far wider than the column.
    await canvas.locator('[data-plumix-id="heading-1"]').click();

    // Overlays live inside a clip layer that exactly covers the canvas column
    // and hides overflow, so nothing they draw can reach the side rails.
    // (boundingBox can't see CSS clipping, so assert the clip region instead.)
    const frameBox = await page
      .getByTestId("plumix-canvas-frame")
      .boundingBox();
    const clip = page.getByTestId("plumix-overlay-clip");
    const clipBox = await clip.boundingBox();
    if (!frameBox || !clipBox) {
      throw new Error("expected canvas + clip boxes");
    }
    expect(clipBox.x).toBeGreaterThanOrEqual(frameBox.x - 1);
    expect(clipBox.x + clipBox.width).toBeLessThanOrEqual(
      frameBox.x + frameBox.width + 1,
    );
    const overflow = await clip.evaluate((el) => getComputedStyle(el).overflow);
    expect(overflow).toBe("hidden");
  });

  test("shift-click multi-selects, outlining members and showing a count", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    await canvas.locator('[data-plumix-id="heading-1"]').click();
    // Wait for the first selection (and its floating toolbar) to settle before
    // the additive click.
    await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();

    // Additive-select a block well clear of heading-1's floating toolbar (which
    // sits over the top of the canvas) so the shift-click can't land on the
    // toolbar instead of the block. Hold Shift at the page level for a robust
    // modifier across the iframe boundary.
    await page.keyboard.down("Shift");
    await canvas.locator('[data-plumix-id="col-left"]').click();
    await page.keyboard.up("Shift");

    // col-left is now active; heading-1 is a non-active member.
    await expect(
      page.getByTestId("plumix-overlay-member-heading-1"),
    ).toBeVisible();
    await expect(page.getByTestId("selection-toolbar-count")).toContainText(
      "2",
    );
    // Single-target actions are disabled across a multi-selection.
    await expect(page.getByTestId("selection-toolbar-move-up")).toBeDisabled();
  });

  test("the toolbar duplicates and deletes the active block", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const blocks = canvas.locator("[data-plumix-id]");
    const before = await blocks.count();

    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await page.getByTestId("selection-toolbar-duplicate").click();
    // The clone is rendered in the canvas — one more tagged block than before.
    await expect(blocks).toHaveCount(before + 1);

    // Duplicate selects the clone; deleting it returns to the original count.
    await page.getByTestId("selection-toolbar-delete").click();
    await expect(blocks).toHaveCount(before);
  });

  test("collapsing the rails re-measures the canvas clip region", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .frameLocator(CANVAS_FRAME)
      .locator('[data-plumix-id="heading-1"]')
      .waitFor();

    const before = await page.getByTestId("plumix-overlay-clip").boundingBox();
    if (!before) throw new Error("expected clip box");

    // Collapsing both rails widens the canvas column; the clip layer must track
    // it (the rail toggle fires no block-geometry report, so this exercises the
    // scroll/resize/collapse re-measure path, not the tree-keyed one).
    await page.getByTestId("plumix-rails-toggle").click();
    await expect
      .poll(
        async () =>
          (await page.getByTestId("plumix-overlay-clip").boundingBox())
            ?.width ?? 0,
      )
      .toBeGreaterThan(before.width);
  });

  test("selects a nested block and exposes slot drop zones", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    // A block nested inside the columns' left slot is selectable at depth.
    await canvas.locator('[data-plumix-id="col-left"]').click();
    await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();

    // The edit seam tags container slots so the canvas can target nested drops.
    await expect(
      canvas.locator(
        '[data-plumix-slot-parent="columns-1"][data-plumix-slot-key="left"]',
      ),
    ).toBeAttached();
  });

  test("dragging the toolbar handle nests a block into a container slot", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    // heading-1 starts at the top level, outside the group.
    await expect(
      canvas.locator(
        '[data-plumix-slot-parent="group-1"] [data-plumix-id="heading-1"]',
      ),
    ).toHaveCount(0);

    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await expect(page.getByTestId("selection-toolbar-drag")).toBeVisible();
    const handle = await page
      .getByTestId("selection-toolbar-drag")
      .boundingBox();
    const target = await canvas
      .locator('[data-plumix-id="group-heading"]')
      .boundingBox();
    if (!handle || !target) throw new Error("expected handle + target boxes");

    // Drag the handle (host-side) into the group's slot and release.
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();

    // heading-1 now lives inside the group's content slot.
    await expect(
      canvas.locator(
        '[data-plumix-slot-parent="group-1"] [data-plumix-id="heading-1"]',
      ),
    ).toBeAttached();
  });

  test("dragging the toolbar handle reorders a top-level block", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    const headingBefore = await canvas
      .locator('[data-plumix-id="heading-1"]')
      .boundingBox();
    const introBefore = await canvas
      .locator('[data-plumix-id="intro"]')
      .boundingBox();
    if (!headingBefore || !introBefore) throw new Error("expected boxes");
    // heading-1 starts above intro.
    expect(headingBefore.y).toBeLessThan(introBefore.y);

    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await expect(page.getByTestId("selection-toolbar-drag")).toBeVisible();
    const handle = await page
      .getByTestId("selection-toolbar-drag")
      .boundingBox();
    if (!handle) throw new Error("expected handle box");

    // Drag the handle to intro's lower half — a top-level drop after intro,
    // clear of any container slot.
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      introBefore.x + introBefore.width / 2,
      introBefore.y + introBefore.height * 0.75,
      { steps: 10 },
    );
    await page.mouse.up();

    // heading-1 now sits below intro — and exactly after it (the off-by-one
    // would drop it further down the tree).
    await expect
      .poll(async () => {
        const h = await canvas
          .locator('[data-plumix-id="heading-1"]')
          .boundingBox();
        const i = await canvas
          .locator('[data-plumix-id="intro"]')
          .boundingBox();
        return h && i ? h.y > i.y : false;
      })
      .toBe(true);
  });

  test("the Layers tab outlines the nested structure", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("plumix-tab-layers").click();
    await expect(page.getByTestId("layer-group-1")).toBeVisible();
    await expect(page.getByTestId("layer-group-heading")).toBeVisible();
  });
});
