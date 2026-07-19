// Real-browser coverage of the geometry-dependent editor surface. The mock-RPC
// admin suite can't serve the canvas iframe, so selection overlays, the
// floating toolbar, and multi-select are unit-tested there but never rendered.
// Here the playground's same-origin canvas makes the bridge — and the real
// geometry it reports — work end to end.
//
// NB: this harness mounts the editor and boots the canvas directly — it does
// NOT go through the real render's edit gate (canEdit → resolveEditMode →
// injectEditorBootstrap). So green here means "given a booted editor, behavior
// works", never "the editor boots on a real render". That the gate injects the
// runtime for an authed user is covered in core's edit-mode.render.test.ts, and
// end to end in the demo runtime in runtime-cloudflare's demo.spec.ts.

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

    // A column nested inside the columns row is selectable at depth.
    await canvas.locator('[data-plumix-id="col-left"]').click();
    await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();

    // The edit seam tags container slots so the canvas can target nested drops.
    await expect(
      canvas.locator(
        '[data-plumix-slot-parent="columns-1"][data-plumix-slot-key="columns"]',
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
    // Await the drop target's paint before measuring — boundingBox() returns
    // null for a not-yet-visible element, which raced under slow CI.
    const groupHeading = canvas.locator('[data-plumix-id="group-heading"]');
    await expect(groupHeading).toBeVisible();
    const target = await groupHeading.boundingBox();
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

  test("the in-canvas appender opens a slot-scoped inserter that nests a pick", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    // Empty the left column's content slot so its in-canvas appender appears.
    await canvas.locator('[data-plumix-id="col-left-text"]').click();
    await page.getByTestId("selection-toolbar-delete").click();
    const appender = canvas.locator(
      '[data-plumix-add][data-plumix-add-parent="col-left"][data-plumix-add-slot="content"]',
    );
    await expect(appender).toBeVisible();

    // Clicking it opens the inserter popover (host-side, anchored to the slot)
    // rather than silently inserting a default.
    await appender.click();
    const popover = page.getByTestId("plumix-inserter-popover");
    await expect(popover).toBeVisible();

    // The list is bounded by the ScrollArea viewport (max-h-96 ≈ 384px) rather
    // than spilling out of the popover — guards the viewport-targeted cap, which
    // silently fails if the scroll-area data-slot ever drifts.
    const viewport = popover.locator('[data-slot="scroll-area-viewport"]');
    const box = await viewport.boundingBox();
    if (!box) throw new Error("expected scroll-area viewport box");
    expect(box.height).toBeLessThanOrEqual(400);

    // Picking a block nests it into that column and closes the popover. The
    // fresh text block is empty (no box), so assert attachment, not visibility.
    await popover.getByTestId("block-catalog-item-core/rich-text").click();
    await expect(popover).toBeHidden();
    await expect(
      canvas.locator(
        '[data-plumix-id="col-left"] [data-plumix-block="core/rich-text"]',
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

  test("the Blocks tab lists variations and a patterns section", async ({
    page,
  }) => {
    await page.goto("/");

    // The augmented core/group surfaces its inserter variation in place of the
    // bare block; the seeded pattern shows under the patterns group.
    await expect(
      page.getByTestId("block-catalog-item-core/group/group/two-column"),
    ).toBeVisible();
    await expect(page.getByTestId("block-catalog-patterns")).toBeVisible();
    await expect(
      page.getByTestId("block-catalog-pattern-starter/hero"),
    ).toBeVisible();
  });

  test("inserting a pattern from the left-rail catalog splices its whole composition", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const blocks = canvas.locator("[data-plumix-id]");
    const before = await blocks.count();

    // The catalog lives in the left rail (no toolbar "+ Add Block" popover).
    // Inserting the hero pattern splices its whole two-block composition at once.
    await page.getByTestId("block-catalog-pattern-starter/hero").click();
    await expect(blocks).toHaveCount(before + 2);
  });

  test("selecting a text block reveals the right-rail Tiptap editor", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    await canvas.locator('[data-plumix-id="intro"]').click();

    // The Block tab now hosts the rich-text rail: a formatting toolbar (format
    // dropdown + inline marks + blockquote, the unified Text block) plus the
    // contenteditable surface seeded with the block's body.
    await expect(page.getByTestId("block-input-body-bold")).toBeVisible();
    await expect(page.getByTestId("block-input-body-italic")).toBeVisible();
    await expect(page.getByTestId("block-input-body-clear")).toBeVisible();
    await expect(page.getByTestId("block-input-body-editor")).toBeVisible();
  });

  test("typing in the rail flows live to the canvas without losing focus", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    await canvas.locator('[data-plumix-id="intro"]').click();
    const editor = page.getByTestId("block-input-body-editor");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    // A multi-character burst: if focus were lost across the patch loop's
    // re-renders, only the first character would survive.
    await page.keyboard.type("Edited inline");

    await expect(editor).toContainText("Edited inline");
    await expect(canvas.locator('[data-plumix-id="intro"]')).toContainText(
      "Edited inline",
    );
  });

  test("switching between text blocks re-points the rail at each body", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const editor = page.getByTestId("block-input-body-editor");

    await canvas.locator('[data-plumix-id="intro"]').click();
    await expect(editor).toContainText("standalone harness");

    // The same stable editor instance must swap to the next block's body — no
    // content bleed from the previously selected block.
    await canvas.locator('[data-plumix-id="col-left-text"]').click();
    await expect(editor).toContainText("Left column");
    await expect(editor).not.toContainText("standalone harness");
  });

  test("the header exposes a preview menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("plumix-preview-menu")).toBeVisible();
  });

  test("preview mode hides the editing chrome and renders read-only", async ({
    page,
  }) => {
    await page.goto("/?readonly");

    // The preview shell renders the banner + canvas, no editing rails/toolbar.
    await expect(page.getByTestId("plumix-editor-preview")).toBeVisible();
    await expect(page.getByTestId("playground-preview-banner")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-toolbar")).toHaveCount(0);
    await expect(page.getByTestId("plumix-editor-left")).toHaveCount(0);
    await expect(page.getByTestId("plumix-add-block")).toHaveCount(0);

    // The real theme still renders the content; clicking a block draws no
    // selection overlay (no editing affordances).
    const canvas = page.frameLocator(CANVAS_FRAME);
    await expect(canvas.locator('[data-plumix-id="heading-1"]')).toBeVisible();
    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await expect(page.getByTestId("plumix-overlay-selected")).toHaveCount(0);
    await expect(page.getByTestId("plumix-selection-toolbar")).toHaveCount(0);
  });

  test("device switch resizes the canvas to the breakpoint widths", async ({
    page,
  }) => {
    await page.goto("/");
    const iframe = page.locator(CANVAS_FRAME);
    const widthFor = async (device: string): Promise<number> => {
      await page.getByTestId(`plumix-device-${device}`).click();
      return iframe.evaluate((el) => (el as HTMLElement).offsetWidth);
    };

    // offsetWidth is the unscaled layout width (the device's breakpoint width),
    // unaffected by the fit-to-width transform.
    const mobile = await widthFor("mobile");
    const tablet = await widthFor("tablet");
    const desktop = await widthFor("desktop");
    expect(mobile).toBeLessThan(tablet);
    expect(tablet).toBeLessThan(desktop);
    expect(desktop).toBe(1280);
  });

  test("device switch keeps the frame centered and on-screen", async ({
    page,
  }) => {
    await page.goto("/");
    const container = page.getByTestId("plumix-canvas-frame");
    const iframe = page.locator(CANVAS_FRAME);

    // The thing this guards: a narrower device must re-land centered and fully
    // visible, never pinned to a corner or pushed off-stage.
    for (const device of ["mobile", "tablet", "desktop"]) {
      await page.getByTestId(`plumix-device-${device}`).click();
      const c = await container.boundingBox();
      const f = await iframe.boundingBox();
      expect(c && f).toBeTruthy();
      if (!c || !f) continue;
      // Within the viewport horizontally (allow 1px rounding).
      expect(f.x).toBeGreaterThanOrEqual(c.x - 1);
      expect(f.x + f.width).toBeLessThanOrEqual(c.x + c.width + 1);
      // Centered: equal left/right margins.
      const leftMargin = f.x - c.x;
      const rightMargin = c.x + c.width - (f.x + f.width);
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(2);
    }
  });

  test("wheel pans the canvas (no scrollbars, free stage)", async ({
    page,
  }) => {
    await page.goto("/");
    const iframe = page.locator(CANVAS_FRAME);
    const before = await iframe.boundingBox();
    expect(before).toBeTruthy();

    await page.getByTestId("plumix-canvas-frame").hover();
    await page.mouse.wheel(0, 240); // scroll down → content pans up

    await expect
      .poll(async () => (await iframe.boundingBox())?.y ?? 0)
      .toBeLessThan((before?.y ?? 0) - 20);
  });

  test("dragging the frame header strip pans the canvas", async ({ page }) => {
    await page.goto("/");
    const iframe = page.locator(CANVAS_FRAME);
    const before = await iframe.boundingBox();
    const handle = await page.getByTestId("plumix-canvas-handle").boundingBox();
    if (!before || !handle) throw new Error("expected frame + handle boxes");

    // The strip rides just above the frame (inside the panned/zoomed stage),
    // left-aligned to it — not a fixed band welded to the viewport top.
    expect(handle.y + handle.height).toBeLessThanOrEqual(before.y + 1);
    expect(Math.abs(handle.x - before.x)).toBeLessThan(2);

    // Press-drag the strip (no Space) — the frame should follow the pointer.
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handle.x + handle.width / 2 - 160,
      handle.y + handle.height / 2 + 120,
      { steps: 15 },
    );
    await page.mouse.up();

    await expect
      .poll(async () => {
        const b = await iframe.boundingBox();
        return b
          ? Math.abs(b.x - before.x) > 20 || Math.abs(b.y - before.y) > 20
          : false;
      })
      .toBe(true);
  });

  test("holding Space and dragging still pans the canvas", async ({ page }) => {
    await page.goto("/");
    const iframe = page.locator(CANVAS_FRAME);
    const frame = await page.getByTestId("plumix-canvas-frame").boundingBox();
    const before = await iframe.boundingBox();
    if (!frame || !before) throw new Error("expected frame boxes");

    // Space arms pan mode (grab cursor); a drag over the canvas then pans it.
    await page.keyboard.down("Space");
    await page.mouse.move(
      frame.x + frame.width / 2,
      frame.y + frame.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      frame.x + frame.width / 2 - 160,
      frame.y + frame.height / 2 - 120,
      { steps: 15 },
    );
    await page.mouse.up();
    await page.keyboard.up("Space");

    await expect
      .poll(async () => {
        const b = await iframe.boundingBox();
        return b
          ? Math.abs(b.x - before.x) > 20 || Math.abs(b.y - before.y) > 20
          : false;
      })
      .toBe(true);
  });

  test("zoom to selection (Shift+2) frames the active block", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const overlay = page.getByTestId("plumix-overlay-selected");

    // The heading sits at the top in fit mode; framing it should recenter it
    // vertically. ("Shift+2" emits code "Digit2", which the handler keys off.)
    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await expect(overlay).toBeVisible();
    const before = await overlay.boundingBox();
    expect(before).toBeTruthy();

    await page.keyboard.press("Shift+2");
    await expect
      .poll(async () => (await overlay.boundingBox())?.y ?? 0)
      .toBeGreaterThan((before?.y ?? 0) + 30);
  });

  test("zoom controls show a percentage and re-fit to width", async ({
    page,
  }) => {
    await page.goto("/");
    const percent = page.getByTestId("plumix-zoom-percent");
    await expect(percent).toBeVisible();
    await expect(percent).toContainText("%");

    await page.getByTestId("plumix-zoom-in").click();
    // A manual zoom pins a step; the readout reflects it.
    await expect(percent).toContainText("%");
  });

  test("the Styles tab edits a block's style per device", async ({ page }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    await canvas.locator('[data-plumix-id="heading-1"]').click();

    await page.getByTestId("plumix-tab-styles").click();
    await expect(page.getByTestId("styles-tab")).toBeVisible();
    await expect(page.getByTestId("styles-section-typography")).toBeVisible();

    // Set the font size (the seed theme declares no font-size tokens, so the
    // control shows its custom input directly) and a per-side custom padding;
    // both land on the canonical tree (visible through the source dialog).
    await page.getByTestId("style-control-fontSize-custom").fill("20px");
    await page.getByTestId("style-control-paddingTop-mode-custom").click();
    await page.getByTestId("style-control-paddingTop-custom").fill("12px");

    await page.getByTestId("plumix-view-source").click();
    const json = page.getByTestId("json-inspector-output");
    await expect(json).toContainText('"fontSize"');
    await expect(json).toContainText('"paddingTop"');
    await expect(json).toContainText('"12px"');
  });

  test("a loader-backed block offers a scoped refresh that updates the canvas", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);

    // The feed block opens with no loader data (no SSR in the harness).
    const feedData = canvas.locator('[data-testid="feed-data"]');
    await expect(feedData).toContainText("no data yet");

    // Selecting it reveals the refresh control; a plain block does not.
    await canvas.locator('[data-plumix-id="feed-1"]').click();
    await expect(page.getByTestId("refresh-block-loader")).toBeVisible();

    // Refresh round-trips through the host stub and pushes data to the canvas.
    await page.getByTestId("refresh-block-loader").click();
    await expect(feedData).toContainText("refreshed");

    // A non-loader block hides the control entirely.
    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await expect(page.getByTestId("refresh-block-loader")).toHaveCount(0);
  });

  test("x-ray toggle outlines every block in the canvas", async ({ page }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const root = canvas.locator('[data-testid="plumix-editor-canvas"]');
    // The flag crosses the bridge into the iframe and gates the outline CSS.
    await expect(root).not.toHaveAttribute("data-plumix-xray", "");

    await page.getByTestId("plumix-xray-toggle").click();
    await expect(root).toHaveAttribute("data-plumix-xray", "");

    await page.getByTestId("plumix-xray-toggle").click();
    await expect(root).not.toHaveAttribute("data-plumix-xray", "");
  });

  test("x-ray outlines nested blocks, not just top-level ones", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    // group-heading sits inside the seeded group; heading-1 is top-level.
    const nested = canvas.locator('[data-plumix-id="group-heading"]');
    const top = canvas.locator('[data-plumix-id="heading-1"]');

    // Off: no outline at any depth (toHaveCSS reads computed style).
    await expect(nested).toHaveCSS("outline-style", "none");

    await page.getByTestId("plumix-xray-toggle").click();
    await expect(top).toHaveCSS("outline-style", "dashed");
    // The nested block paints its own outline (descendant selector, any depth).
    await expect(nested).toHaveCSS("outline-style", "dashed");

    await page.getByTestId("plumix-xray-toggle").click();
    await expect(nested).toHaveCSS("outline-style", "none");
  });

  test("Shift+X toggles x-ray from the keyboard", async ({ page }) => {
    await page.goto("/");
    const root = page
      .frameLocator(CANVAS_FRAME)
      .locator('[data-testid="plumix-editor-canvas"]');

    await page.keyboard.press("Shift+KeyX");
    await expect(root).toHaveAttribute("data-plumix-xray", "");
    await expect(page.getByTestId("plumix-xray-toggle")).toHaveAttribute(
      "data-state",
      "on",
    );
  });

  test("Shift+X works with focus inside the canvas iframe (forwarded)", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const root = canvas.locator('[data-testid="plumix-editor-canvas"]');

    // Click a block so focus lands inside the iframe, then the shortcut must
    // still toggle via the canvas:key forward path.
    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await page.keyboard.press("Shift+KeyX");
    await expect(root).toHaveAttribute("data-plumix-xray", "");
  });

  test("copy + paste a block (Cmd/Ctrl+C/V) from canvas focus", async ({
    page,
  }) => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const blocks = canvas.locator("[data-plumix-id]");
    const before = await blocks.count();

    // Clicking a block puts focus inside the iframe; the shortcuts must still
    // work via the canvas:clipboard forward path.
    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await page.keyboard.press("ControlOrMeta+KeyC");
    await page.waitForTimeout(150); // let the async clipboard write settle
    await page.keyboard.press("ControlOrMeta+KeyV");

    await expect(blocks).toHaveCount(before + 1);
  });

  test("group then ungroup selected blocks via the toolbar", async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.frameLocator(CANVAS_FRAME);
    const blocks = canvas.locator("[data-plumix-id]");
    const before = await blocks.count();

    // Multi-select two root siblings, then group → one new container block.
    await canvas.locator('[data-plumix-id="heading-1"]').click();
    await page.keyboard.down("Shift");
    await canvas.locator('[data-plumix-id="intro"]').click();
    await page.keyboard.up("Shift");
    await page.getByTestId("selection-toolbar-group").click();
    await expect(blocks).toHaveCount(before + 1);

    // The new group is active; ungroup restores the original count.
    await page.getByTestId("selection-toolbar-ungroup").click();
    await expect(blocks).toHaveCount(before);
  });

  test("the Layers tab outlines the nested structure", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("plumix-tab-layers").click();
    await expect(page.getByTestId("layer-group-1")).toBeVisible();
    await expect(page.getByTestId("layer-group-heading")).toBeVisible();
  });
});
