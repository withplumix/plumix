// Worker-driven plugin e2e (#255 / #250). Runs against the real pages
// playground at `../playground` via `plumix dev --port 3050`, seeded
// by globalSetup with an admin user + storageState carrying the
// session cookie. No RPC mocking — the spec exercises pages'
// declarative registration (hierarchical `page` entry type) end-to-
// end through core admin's CRUD against real D1, including the
// hierarchical parent picker that's only mounted when
// `isHierarchical: true`.

import { expect, test } from "@playwright/test";

test.describe.serial("@plumix/plugin-pages — worker-driven happy path", () => {
  test("pages list mounts against the real worker and shows the empty state", async ({
    page,
  }) => {
    await page.goto("entries/pages");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
  });

  test("create a draft page → row appears in the list", async ({ page }) => {
    await page.goto("entries/pages");
    await page.getByTestId("content-list-new-button").click();

    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await page.getByTestId("post-editor-title-input").fill("About");
    await page.getByTestId("post-editor-submit").click();

    // On successful create the editor navigates from
    // `/entries/pages/create` to `/entries/pages/<id>/edit` — wait
    // for that URL change before navigating away so we don't race
    // the create RPC.
    await page.waitForURL(/\/entries\/pages\/\d+\/edit/);

    await page.goto("entries/pages");
    const rows = page.locator(
      "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])",
    );
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("About");
  });

  test("set a parent on a second page → hierarchy persists across reload", async ({
    page,
  }) => {
    // Create the child page. `About` from the previous test is the
    // intended parent — the parent picker exposes every existing
    // page (minus self/descendants) as an option.
    await page.goto("entries/pages/create");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await page.getByTestId("post-editor-title-input").fill("Team");
    await page.getByTestId("post-editor-submit").click();
    await page.waitForURL(/\/entries\/pages\/\d+\/edit/);

    // The hierarchical parent select is only rendered when the
    // entry-type's `isHierarchical: true`. Setting it to the
    // pre-existing "About" page should persist after a reload.
    await page
      .getByTestId("post-editor-parent-select")
      .selectOption({ label: "About" });
    await page.getByTestId("post-editor-submit").click();

    await page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );

    await page.reload();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    // `option:checked` reads the currently-selected option's text
    // — avoids pulling DOM lib into the plugin's typecheck for one
    // line of `HTMLSelectElement`.
    await expect(
      page.getByTestId("post-editor-parent-select").locator("option:checked"),
    ).toHaveText("About");
  });
});
