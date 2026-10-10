import { CONTENT_LIST_ROWS, expect, test } from "plumix/test/playwright";

test.describe.serial("@plumix/plugin-blog — worker-driven happy path", () => {
  test("posts list mounts against the real worker", async ({ page }) => {
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    // globalSetup seeds a published post, so the list is never empty.
    // Admin's mock-based entries.spec.ts covers the empty-state UI.
    await expect(
      page.locator(CONTENT_LIST_ROWS).filter({ hasText: "First post" }),
    ).toBeVisible();
  });

  test("create a draft post → row appears in the list", async ({ page }) => {
    // Arm the URL waiter before clicking New — the create route
    // redirects to the edit URL as soon as entry.create resolves.
    await page.goto("entries/posts");
    const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
    await page.getByTestId("content-list-new-button").click();
    await navigated;

    // Title lives in the editor's Page (document) tab.
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("plumix-editor-title-input").fill("Hello world");
    await updated;

    await page.goto("entries/posts");
    // By title, not count: CI retries reuse the same D1, so a retry sees rows
    // the prior attempt created.
    await expect(
      page
        .locator(CONTENT_LIST_ROWS)
        .filter({ hasText: "Hello world" })
        .first(),
    ).toBeVisible();
  });

  // FIXME(editor-refinement): canvas re-renders stale Playwright's click
  // handle before dispatch, so Publish never fires; re-enable once the editor
  // re-render stability is fixed.
  test("edit the draft → publish → status persists across reload", async ({
    page,
  }) => {
    await page.goto("entries/posts");
    // Target the post this suite created by title — `.first()` alone
    // could grab a row a retry left behind (see the create test).
    const row = page
      .locator(CONTENT_LIST_ROWS)
      .filter({ hasText: "Hello world" })
      .first();
    const rowTestid = await row.getAttribute("data-testid");
    if (!rowTestid) throw new Error("expected post row to have a data-testid");
    const id = rowTestid.replace("content-list-row-", "");

    await page.goto(`entries/posts/${id}/edit`);
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();

    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("plumix-editor-publish-button").click();
    await updated;
    // Published draft (no pending autosave) leaves the plain Publish button,
    // now disabled — the editor's published receipt.
    await expect(
      page.getByTestId("plumix-editor-publish-button"),
    ).toBeDisabled();

    // Matched by title rather than count, since a retry may have published its
    // own copy.
    await page.goto("entries/posts?status=published");
    await expect(
      page
        .locator(CONTENT_LIST_ROWS)
        .filter({ hasText: "Hello world" })
        .first(),
    ).toBeVisible();
  });

  test("the public theme page serves the admin bar in the user's locale", async ({
    page,
  }) => {
    // Arm the reload's load event before selecting, so the later navigation
    // can't race the card's reload into net::ERR_ABORTED.
    await page.goto("profile");
    await page.getByTestId("locale-switcher-trigger").click();
    const reloaded = page.waitForEvent("load");
    await page.getByTestId("locale-switcher-option-uk").click();
    await reloaded;

    // "/" resolves to the public root (baseURL's origin), not the admin base
    // path.
    await page.goto("/");
    const bar = page.getByTestId("plumix-admin-bar");
    await expect(bar).toBeVisible();
    // The "+ New" group label comes from core's compiled uk catalog.
    await expect(bar).toContainText("+ Новий");
  });
});
