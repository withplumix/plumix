// Worker-driven plugin e2e (#254 / #250). Runs against the real blog
// playground at `../playground` via `plumix dev --port 3020`, seeded
// by globalSetup with an admin user + storageState carrying the
// session cookie. No RPC mocking — the spec exercises blog's
// declarative registration (post entry type + category/tag taxonomies)
// end-to-end through core admin's CRUD against real D1.

import { expect, test } from "@playwright/test";

// Title links carry `content-list-row-<id>`; the actions strip and
// trash button reuse the prefix, so exclude them when counting rows.
const CONTENT_ROWS =
  "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])";

test.describe.serial("@plumix/plugin-blog — worker-driven happy path", () => {
  test("posts list mounts against the real worker", async ({ page }) => {
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    // Soft empty-state assertion: only enforce when the list actually
    // has no rows. Playwright retries the whole `describe.serial`
    // block on any failure, so a strict empty-state check here would
    // cascade-fail once a later test had created a post — turning one
    // real failure into three reported ones. Admin's mock-based
    // entries.spec.ts covers the empty-state UI exhaustively.
    const rows = page.locator(CONTENT_ROWS);
    if ((await rows.count()) === 0) {
      await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
    }
  });

  test("create a draft post → row appears in the list", async ({ page }) => {
    // Arm the URL waiter before clicking New — the create route
    // redirects to the edit URL as soon as entry.create resolves.
    await page.goto("entries/posts");
    const navigated = page.waitForURL(/\/entries\/posts\/\d+\/editor/);
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
    // Assert by title, not an absolute count: CI retries re-run this
    // `describe.serial` block against the same worker D1 (wiped once at
    // webServer start, not per attempt), so a retry sees rows the prior
    // attempt created. `toHaveCount(1)` cascade-fails with "Received: 2".
    await expect(
      page.locator(CONTENT_ROWS).filter({ hasText: "Hello world" }).first(),
    ).toBeVisible();
  });

  // FIXME(editor-refinement): the live canvas iframe re-renders the toolbar so
  // rapidly that Playwright's resolved click handle goes stale before dispatch,
  // so the toolbar Publish button click never reaches React's handler (no
  // entry.update fires) against the real worker. A human click still works
  // (target resolves at mouse-up), and the publish wiring is covered by the
  // admin mock e2e ("clicking the Publish button POSTs entry.update"). Re-enable
  // once the editor re-render/zoom-fit stability is fixed in the refinement pass.
  test.fixme("edit the draft → publish → status persists across reload", async ({
    page,
  }) => {
    await page.goto("entries/posts");
    // Target the post this suite created by title — `.first()` alone
    // could grab a row a retry left behind (see the create test).
    const row = page
      .locator(CONTENT_ROWS)
      .filter({ hasText: "Hello world" })
      .first();
    const rowTestid = await row.getAttribute("data-testid");
    if (!rowTestid) throw new Error("expected post row to have a data-testid");
    const id = rowTestid.replace("content-list-row-", "");

    await page.goto(`entries/posts/${id}/editor`);
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();

    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/entry/update") && r.status() === 200,
    );
    await page.getByTestId("plumix-editor-publish-button").click();
    await updated;
    // Published draft (no pending autosave) leaves the plain Publish button,
    // now disabled — the bespoke editor's published receipt.
    await expect(
      page.getByTestId("plumix-editor-publish-button"),
    ).toBeDisabled();

    // The server-side status filter is the persistence proof: the row
    // comes back under ?status=published from real D1. Match by title
    // rather than count — a retry may have published its own copy.
    await page.goto("entries/posts?status=published");
    await expect(
      page.locator(CONTENT_ROWS).filter({ hasText: "Hello world" }).first(),
    ).toBeVisible();
  });

  test("the public theme page serves the admin bar in the user's locale", async ({
    page,
  }) => {
    // Switch the seeded admin's locale via the profile card; the
    // setLocale RPC persists user.meta.locale in real D1, then the card
    // does `window.location.reload()` on success. Arm the reload's load
    // event BEFORE selecting so the later navigation to the public page
    // can't race that reload into net::ERR_ABORTED (the CI flake).
    await page.goto("profile");
    await page.getByTestId("locale-switcher-trigger").click();
    const reloaded = page.waitForEvent("load");
    await page.getByTestId("locale-switcher-option-uk").click();
    await reloaded;

    // The front page is the theme's SSR surface, not the admin SPA —
    // the worker resolves the session, reads meta.locale, and renders
    // the bar chrome from core's compiled po catalogs. "/" resolves to
    // the public root (baseURL's origin), not the admin base path.
    await page.goto("/");
    const bar = page.getByTestId("plumix-admin-bar");
    await expect(bar).toBeVisible();
    // The "+ New" group label comes from core's compiled uk catalog.
    await expect(bar).toContainText("+ Новий");
  });
});
