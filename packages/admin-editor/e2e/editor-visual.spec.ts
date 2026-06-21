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

  test("shift-click multi-selects, outlining members and showing a count", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await canvas
      .locator('[data-plumix-id="intro"]')
      .click({ modifiers: ["Shift"] });

    // intro is now active (strong outline); heading-1 is a non-active member.
    await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();
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

  test("the Layers tab outlines the nested structure", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("plumix-tab-layers").click();
    await expect(page.getByTestId("layer-group-1")).toBeVisible();
    await expect(page.getByTestId("layer-group-heading")).toBeVisible();
  });
});
