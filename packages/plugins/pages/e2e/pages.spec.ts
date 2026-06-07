// Worker-driven plugin e2e (#255 / #250). Runs against the real pages
// playground at `../playground` via `plumix dev --port 3050`, seeded
// by globalSetup with an admin user + storageState carrying the
// session cookie. No RPC mocking — the spec exercises pages'
// declarative registration (hierarchical `page` entry type) end-to-
// end through core admin's CRUD against real D1.

import { expect, test } from "@playwright/test";

// Title links carry `content-list-row-<id>`; the actions strip and
// trash button reuse the prefix, so exclude them when counting rows.
const CONTENT_ROWS =
  "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])";

test.describe.serial("@plumix/plugin-pages — worker-driven happy path", () => {
  test("pages list mounts against the real worker", async ({ page }) => {
    await page.goto("entries/pages");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    // Soft empty-state assertion: only enforce when the list actually
    // has no rows. See `packages/plugins/blog/e2e/blog.spec.ts` for
    // the cascade-failure rationale.
    const rows = page.locator(CONTENT_ROWS);
    if ((await rows.count()) === 0) {
      await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
    }
  });

  test("create a draft page → row appears in the list", async ({ page }) => {
    // Arm the URL waiter before clicking New — the create route
    // redirects to the edit URL as soon as entry.create resolves.
    await page.goto("entries/pages");
    const navigated = page.waitForURL(/\/entries\/pages\/\d+\/edit/);
    await page.getByTestId("content-list-new-button").click();
    await navigated;

    await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("plumix-editor-title-input").fill("About");
    await updated;

    await page.goto("entries/pages");
    // Assert the created row exists by title, not an absolute count:
    // CI retries re-run this `describe.serial` block against the same
    // worker D1 (wiped once at webServer start, not per attempt), so a
    // retry sees rows the prior attempt created. Existence survives
    // that; `toHaveCount(1)` cascade-fails with "Received: 2".
    await expect(
      page.locator(CONTENT_ROWS).filter({ hasText: "About" }).first(),
    ).toBeVisible();
  });

  test("set a parent on a second page → hierarchy persists across reload", async ({
    page,
  }) => {
    // Create the child page. `About` from the previous test is the
    // intended parent — the parent picker exposes every existing
    // page (minus self) as an option in the Document tab.
    await page.goto("entries/pages/create");
    await page.waitForURL(/\/entries\/pages\/\d+\/edit/);
    await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
    const titleSaved = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("plumix-editor-title-input").fill("Team");
    await titleSaved;

    await page.getByTestId("plumix-editor-tab-document").click();
    const parentSaved = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page
      .getByTestId("entry-parent-select")
      .selectOption({ label: "About" });
    await parentSaved;

    await page.reload();
    await page.getByTestId("plumix-editor-tab-document").click();
    // `option:checked` reads the currently-selected option's text
    // — avoids pulling DOM lib into the plugin's typecheck for one
    // line of `HTMLSelectElement`.
    await expect(
      page.getByTestId("entry-parent-select").locator("option:checked"),
    ).toHaveText("About");
  });
});
