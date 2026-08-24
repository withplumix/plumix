// Worker-driven plugin e2e (#251 / #250). Runs against the real menu
// playground at `../playground` via `plumix dev`, seeded by globalSetup
// with an admin user + storageState carrying the session cookie. No
// RPC mocking — the spec exercises the menu plugin end-to-end through
// the actual oRPC + D1 round-trip.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

// MenuItemEditor.tsx — must match the constant in the component
// because drag projection compares `delta.x` against this width.
const INDENTATION_WIDTH = 24;

// The worker-assigned slug of the menu the first test creates. The rig
// hands every attempt an empty database, so this now resolves to
// `primary` every time — it stays read rather than hard-coded because
// the slug is the server's to choose, and the assertion on its shape is
// the only thing in this suite guarding `slugify`.
let menuSlug = "";

// Tests share state across the serial sequence: the menu created in
// the first test is reused for locations assignment + drag-nest + the
// max-depth ceiling check.
test.describe.serial("@plumix/plugin-menu — worker-driven happy path", () => {
  test("create menu → add items → reorder → save → reload persists", async ({
    page,
  }) => {
    // 1. Open the menus admin page. The admin shell is loaded over a
    //    real session cookie (storageState) so the menus route renders
    //    without bouncing to /login.
    await page.goto("pages/menus");
    await expect(page.getByTestId("menus-shell")).toBeVisible();

    // 2. Create a menu. The "create new" sentinel opens a dialog; name the
    //    menu and submit.
    await page.getByTestId("menus-selector-create-new").click();
    await page.getByTestId("menus-create-name").fill("Primary");
    await page.getByTestId("menus-create-submit").click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();
    // The shell mirrors the selected menu into `?menu=<slug>`
    // (`admin/url-state.ts`) — the only place the worker-assigned slug
    // surfaces client-side. The shape is still pinned, so a `slugify`
    // regression can't hide behind "whatever the server returned".
    menuSlug = new URL(page.url()).searchParams.get("menu") ?? "";
    expect(menuSlug).toMatch(/^primary(-\d+)?$/);
    await expect(menuOption(page)).toBeVisible();

    // 3. Add two custom items via the picker's Custom tab.
    await page.getByTestId("menu-picker-tab-custom").click();
    await expect(page.getByTestId("menu-picker-custom-panel")).toBeVisible();

    await page.getByTestId("menu-picker-custom-url").fill("/");
    await page.getByTestId("menu-picker-custom-label").fill("Home");
    await page.getByTestId("menu-picker-custom-add").click();

    await page.getByTestId("menu-picker-custom-url").fill("/docs");
    await page.getByTestId("menu-picker-custom-label").fill("Docs");
    await page.getByTestId("menu-picker-custom-add").click();

    const rowLocators = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(rowLocators).toHaveCount(2);

    // Capture the second row's id so we can focus its drag handle for
    // the keyboard reorder below; ids are server-assigned, so we
    // can't pre-compute them.
    const secondTestid = await rowLocators.nth(1).getAttribute("data-testid");
    if (!secondTestid) throw new Error("second row missing data-testid");
    const secondId = secondTestid.replace("menu-item-row-", "");

    // 4. Reorder via the keyboard sensor — pick up the second row
    //    with Space, move it above the first row with ArrowUp, drop
    //    with Space. KeyboardSensor calls preventDefault on Space so
    //    the activator's native click is suppressed.
    const dragHandle = page.getByTestId(`menu-item-drag-${secondId}`);
    await dragHandle.focus();
    await page.keyboard.press("Space");
    // `useSortable` puts `aria-pressed` on the activator for the life of
    // the drag, so this is the pickup landing.
    await expect(dragHandle).toHaveAttribute("aria-pressed", "true");
    // Pickup is necessary but not sufficient. A keypress has several ways
    // to be silently ignored — KeyboardSensor adds its keydown listener
    // from a `setTimeout` (`attach()`) and Blink hands synthesized input to
    // the page ahead of pending timers; `sortableKeyboardCoordinates` bails
    // on a missing `collisionRect` or droppable rect — and all of them look
    // the same from here: the drop just puts the row back. Re-send until
    // the tree shifts; once the row is at the top ArrowUp moves nothing, so
    // the extra presses cost nothing.
    // Positive translateY on the row above is `verticalListSortingStrategy`
    // reacting to the new drop target. The distance is that row's height,
    // which the spec has no business pinning.
    const shiftedDown = /^matrix\(1, 0, 0, 1, 0, [1-9]/;
    await expect(async () => {
      await page.keyboard.press("ArrowUp");
      await expect(rowLocators.first()).toHaveCSS("transform", shiftedDown, {
        timeout: 500,
      });
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Space");

    // After reorder, the originally-second row (Docs) is now first.
    await expect(rowLocators.first()).toContainText("Docs");
    await expect(rowLocators.last()).toContainText("Home");

    // 5. Save. Wait for the network round-trip so reload reads
    //    committed state.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    // 6. Reload and re-open the editor. The reordered state persists.
    await page.reload();
    await expect(page.getByTestId("menus-shell")).toBeVisible();
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    const reloadedRows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(reloadedRows).toHaveCount(2);
    await expect(reloadedRows.first()).toContainText("Docs");
    await expect(reloadedRows.last()).toContainText("Home");
  });

  test("locations tab — assign the menu to Primary Nav, reload, assignment persists", async ({
    page,
  }) => {
    await page.goto("pages/menus");
    await expect(page.getByTestId("menus-shell")).toBeVisible();

    // Switch to the Locations tab. The menu plugin's default
    // playground config registers "primary" as a location.
    await page.getByTestId("menus-tab-locations").click();
    await expect(page.getByTestId("menus-tab-locations-panel")).toBeVisible();

    // Assign the menu created above to the "primary" location. The
    // select's value matches the menu's slug.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/assignLocation") && r.status() === 200,
    );
    await page.getByTestId("menus-location-select-primary").click();
    await page.getByTestId(`menus-location-select-primary-${menuSlug}`).click();
    await saved;

    // Reload and re-enter the locations tab — assignment persists. The Radix
    // trigger shows the assigned menu's name ("Primary"), not its slug.
    await page.reload();
    await expect(page.getByTestId("menus-shell")).toBeVisible();
    await page.getByTestId("menus-tab-locations").click();
    await expect(
      page.getByTestId("menus-location-select-primary"),
    ).toContainText("Primary");
  });

  test("drag-nest: pointer drag puts Docs under Home and persists across reload", async ({
    page,
  }) => {
    // Open the Primary menu's items editor (created in the first
    // test). We expect 2 rows: Docs (depth 0) then Home (depth 0)
    // (the order the first test left after save).
    await page.goto("pages/menus");
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    const rows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute("data-depth", "0");
    await expect(rows.last()).toHaveAttribute("data-depth", "0");

    // Drop the second row (Home) onto itself with a one-indent
    // horizontal offset. The projection sees previous=Docs (depth 0)
    // and bumps Home to depth 1 (child of Docs).
    const homeTestid = await rows.nth(1).getAttribute("data-testid");
    if (!homeTestid) throw new Error("home row missing data-testid");
    const homeId = homeTestid.replace("menu-item-row-", "");
    await dragRowOnSelf(page, homeId, { nestPx: INDENTATION_WIDTH });
    await expect(page.getByTestId(`menu-item-row-${homeId}`)).toHaveAttribute(
      "data-depth",
      "1",
    );

    // Save round-trips through the worker, then reload + reopen and
    // confirm Home is still at depth 1.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    await page.reload();
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    const reloadedHome = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']")
      .filter({ hasText: "Home" });
    await expect(reloadedHome).toHaveAttribute("data-depth", "1");
  });

  test("max-depth ceiling: setting maxDepth=0 prevents subsequent nesting via drag", async ({
    page,
  }) => {
    // Open the Primary menu's items editor — Home is nested under
    // Docs at depth 1 from the previous test. We're testing the
    // depthCap on the drag projection, not retroactive flattening
    // (the server doesn't auto-clamp existing rows on a maxDepth
    // save).
    await page.goto("pages/menus");
    await menuOption(page).click();
    await expect(page.getByTestId("menu-item-editor")).toBeVisible();

    // Lower maxDepth to 0 (no nesting allowed for new drags).
    await page.getByTestId("menu-settings-max-depth").fill("0");
    await page.getByTestId("menu-settings-max-depth").blur();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    // The first row (Docs) is flat at depth 0. Attempt a drag-nest
    // onto itself with a one-indent horizontal offset — depthCap=0
    // clamps the drop so the row stays at depth 0 even though the
    // pointer asked for depth 1.
    const rows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    const docsTestid = await rows.first().getAttribute("data-testid");
    if (!docsTestid) throw new Error("first row missing data-testid");
    const docsId = docsTestid.replace("menu-item-row-", "");
    await expect(page.getByTestId(`menu-item-row-${docsId}`)).toHaveAttribute(
      "data-depth",
      "0",
    );

    await dragRowOnSelf(page, docsId, { nestPx: INDENTATION_WIDTH });

    // Depth still 0 — projection refused the nest.
    await expect(page.getByTestId(`menu-item-row-${docsId}`)).toHaveAttribute(
      "data-depth",
      "0",
    );
  });
});

function menuOption(page: Page): Locator {
  return page.getByTestId(`menus-selector-option-${menuSlug}`);
}

// dnd-kit's PointerSensor listens for native `pointerdown` /
// `pointermove` / `pointerup` events with a `distance: 5` activation
// gate. Playwright's `page.mouse` API doesn't reliably fire pointer
// events in a sequence the sensor accepts; dispatch them ourselves
// inside a single `page.evaluate` (one CDP roundtrip, microtask burst)
// so the sequence runs without timeout pressure.
//
// Returns once the drop has landed. That matters because a row's
// `data-depth` carries the *projected* depth while a drag is live, so a
// depth read before the drop is the preview rather than the committed
// tree — including the unchanged depth the max-depth test asserts.
async function dragRowOnSelf(
  page: Page,
  rowId: string,
  options: { readonly nestPx?: number } = {},
): Promise<void> {
  const handle = page.getByTestId(`menu-item-drag-${rowId}`);
  const target = page.getByTestId(`menu-item-row-${rowId}`);
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error(`missing bounding box for row ${rowId}`);
  }
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const dropX = targetBox.x + targetBox.width / 2 + (options.nestPx ?? 0);
  const dropY = targetBox.y + targetBox.height / 2;
  const handleSelector = `[data-testid="menu-item-drag-${rowId}"]`;

  const activated = await page.evaluate(
    async ({ selector, startX, startY, dropX, dropY }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`drag handle not found: ${selector}`);
      const base = {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      } as const;
      const yieldToReact = (): Promise<void> =>
        new Promise((resolve) => requestAnimationFrame(() => resolve()));

      // pointerdown on the activator (drag handle) binds the drag to
      // this pointerId.
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...base,
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY,
        }),
      );
      await yieldToReact();

      // After activation dnd-kit attaches its `pointermove` /
      // `pointerup` listeners on `ownerDocument`, not the activator.
      // Dispatch on `document` from here.
      const steps = 12;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        document.dispatchEvent(
          new PointerEvent("pointermove", {
            ...base,
            button: 0,
            buttons: 1,
            clientX: startX + (dropX - startX) * t,
            clientY: startY + (dropY - startY) * t,
          }),
        );
        await yieldToReact();
      }
      // Read before the drop clears it — this is what separates a drag the
      // sensor accepted from a burst of events it ignored.
      const pressed = el.getAttribute("aria-pressed") === "true";
      document.dispatchEvent(
        new PointerEvent("pointerup", {
          ...base,
          button: 0,
          buttons: 0,
          clientX: dropX,
          clientY: dropY,
        }),
      );
      return pressed;
    },
    { selector: handleSelector, startX, startY, dropX, dropY },
  );
  expect(activated, `drag never activated for row ${rowId}`).toBe(true);
  // A dragged row carries a transform for the life of the drag — a
  // self-drop still gives it `matrix(1, 0, 0, 1, 0, 0)` — and loses it when
  // `activeKey` resets. So `none` is the DragEnd commit, which is the same
  // React batch that dispatches the reorder into the editor's reducer.
  // `aria-pressed` can't do this job: it is absent both before the pickup
  // and after the drop, so asserting its absence here always passes.
  await expect(target).toHaveCSS("transform", "none");
  await waitForClicksToLand(page);
}

// dnd-kit keeps a drag from ending in a click by leaving a capture-phase
// `click` swallower on `document`, which `AbstractPointerSensor.detach`
// removes from a 50ms timer. Any click the spec makes inside that window —
// the save button above all — is dropped before React sees it. Poll a probe
// click rather than sleep 50ms: the removal timer runs late under load,
// which is exactly when a fixed sleep loses. A capture-phase
// `stopPropagation` on `document` also keeps the event from document's own
// bubble listeners, so a probe that doesn't come back is the swallower
// still armed.
//
// The probe is invisible to React, whose listeners are delegated to `#root`
// — but not to document-level listeners, and every mounted Radix
// `DismissableLayer` has some. Don't call this with a dialog or select open.
async function waitForClicksToLand(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          let landed = false;
          const seen = (): void => {
            landed = true;
          };
          document.addEventListener("click", seen);
          document.body.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
          );
          document.removeEventListener("click", seen);
          return landed;
        }),
      { message: "dnd-kit's click swallower is still armed", timeout: 2_000 },
    )
    .toBe(true);
}

// Regression: the menus admin page once shipped as bare unstyled HTML (the
// component had zero `className`). Assert it ships styled controls. (The
// admin sidebar's CSS-cascade isolation — the other half of the original
// incident — is guarded admin-side in packages/admin/e2e/app-shell.spec.ts
// + packages/admin/src/styles/globals.test.ts.)
test("admin page ships styled controls", async ({ page }) => {
  await page.goto("pages/menus");
  await expect(page.getByTestId("menus-shell")).toBeVisible();

  const ui = await styledControls(page, "menus-shell");
  expect(ui.total).toBeGreaterThan(0);
  expect(ui.styled).toBeGreaterThan(0);
});

// Counts the plugin shell's interactive controls and how many carry a
// styling class — a count of 0 is the unstyled-component regression signal.
async function styledControls(page: Page, shellTestId: string) {
  return page.evaluate((id) => {
    const shell = document.querySelector(`[data-testid="${id}"]`);
    const controls = shell
      ? Array.from(shell.querySelectorAll("button, a, input, select, label"))
      : [];
    return {
      total: controls.length,
      styled: controls.filter(
        (el) => (el.getAttribute("class") ?? "").trim().length > 0,
      ).length,
    };
  }, shellTestId);
}
