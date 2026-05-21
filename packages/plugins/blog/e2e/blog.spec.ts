// Worker-driven plugin e2e (#254 / #250). Runs against the real blog
// playground at `../playground` via `plumix dev --port 3020`, seeded
// by globalSetup with an admin user + storageState carrying the
// session cookie. No RPC mocking — the spec exercises blog's
// declarative registration (post entry type + category/tag taxonomies)
// end-to-end through core admin's CRUD against real D1.

import { expect, test } from "@playwright/test";

test.describe.serial("@plumix/plugin-blog — worker-driven happy path", () => {
  test("posts list mounts against the real worker", async ({ page }) => {
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    // Soft empty-state assertion: only enforce when the list actually
    // has no rows. Playwright retries the whole `describe.serial`
    // block on any failure, so a strict empty-state check here would
    // cascade-fail once a later test had created a post — turning one
    // real failure into three reported ones. Admin's mock-based
    // content.spec.ts covers the empty-state UI exhaustively.
    const rows = page.locator(
      "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])",
    );
    if ((await rows.count()) === 0) {
      await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
    }
  });

  test("create a draft post → row appears in the list", async ({ page }) => {
    // v2 flow: click New takes the user through /entries/posts/create
    // (the redirect-on-mount route that calls entry.create + navigates
    // to the edit URL), then we land in the Puck editor. Title is
    // bound to the title input; autosave fires on change.
    await page.goto("entries/posts");
    const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
    await page.getByTestId("content-list-new-button").click();
    await navigated;

    // The Puck editor mounts; title input is wired through to
    // entry.update. Wait for autosave to confirm via response.
    await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("plumix-editor-title-input").fill("Hello world");
    await updated;

    // Back to the list — the new row carries the typed title.
    await page.goto("entries/posts");
    const rows = page.locator(
      "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])",
    );
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Hello world");
  });

  test.skip("edit the draft → publish → status persists across reload", async ({
    page,
  }) => {
    await page.goto("entries/posts");
    const rows = page.locator(
      "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])",
    );
    const rowTestid = await rows.first().getAttribute("data-testid");
    if (!rowTestid) throw new Error("expected post row to have a data-testid");
    const id = rowTestid.replace("content-list-row-", "");

    await page.goto(`entries/posts/${id}/edit`);
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    await page
      .getByTestId("post-editor-status-select")
      .selectOption("published");
    // Arm the response waiter BEFORE the click so we never miss a fast
    // update RPC — `waitForResponse` only matches responses that arrive
    // after it's armed, and the update can resolve in <10ms against a
    // warm worker.
    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("post-editor-submit").click();
    await updated;

    await page.reload();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await expect(page.getByTestId("post-editor-status-select")).toHaveValue(
      "published",
    );

    // Back to the list — the row is still there and now in published
    // state. The list defaults to "all" so a published post stays
    // visible.
    await page.goto("entries/posts");
    await expect(
      page.locator(
        "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])",
      ),
    ).toHaveCount(1);
  });
});
