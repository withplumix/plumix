// Worker-driven plugin e2e (#254 / #250). Runs against the real blog
// playground at `../playground` via `plumix dev --port 3020`, seeded
// by globalSetup with an admin user + storageState carrying the
// session cookie. No RPC mocking — the spec exercises blog's
// declarative registration (post entry type + category/tag taxonomies)
// end-to-end through core admin's CRUD against real D1.

import { expect, test } from "@playwright/test";

test.describe.serial("@plumix/plugin-blog — worker-driven happy path", () => {
  test("posts list mounts against the real worker and shows the empty state", async ({
    page,
  }) => {
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
  });

  test("create a draft post → row appears in the list", async ({ page }) => {
    await page.goto("entries/posts");
    await page.getByTestId("content-list-new-button").click();

    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await page.getByTestId("post-editor-title-input").fill("Hello world");
    await page.getByTestId("post-editor-submit").click();

    // On successful create the editor navigates from
    // `/entries/posts/create` to `/entries/posts/<id>/edit` — wait for
    // that URL change before navigating away so we don't race the
    // create RPC.
    await page.waitForURL(/\/entries\/posts\/\d+\/edit/);

    await page.goto("entries/posts");
    // `content-list-row-*` matches the row plus the per-row actions
    // and trash buttons (`content-list-row-actions-<id>`,
    // `content-list-row-trash-<id>`). Filter to just the row.
    const rows = page.locator(
      "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])",
    );
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Hello world");
  });

  test("edit the draft → publish → status persists across reload", async ({
    page,
  }) => {
    // DIAGNOSTIC: log every RPC response so the CI log shows what
    // /entry/update actually returned (status + body). Revert before
    // merging.
    page.on("response", async (r) => {
      const url = r.url();
      if (url.includes("/_plumix/rpc/")) {
        const body = await r
          .text()
          .then((t) => t.slice(0, 600))
          .catch(() => "<no body>");
        console.log(
          `[diag] ${r.request().method()} ${url} → ${r.status()} ${body}`,
        );
      }
    });
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (url.includes("/_plumix/rpc/")) {
        console.log(
          `[diag] requestfailed ${req.method()} ${url}: ${req.failure()?.errorText ?? "?"}`,
        );
      }
    });

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
    // DIAGNOSTIC: capture the request body so we see what
    // expectedLiveUpdatedAt was sent.
    const updateRequest = page.waitForRequest((r) =>
      r.url().endsWith("/entry/update"),
    );
    await page.getByTestId("post-editor-submit").click();
    const req = await updateRequest;
    console.log(
      `[diag] /entry/update request body: ${req.postData() ?? "<none>"}`,
    );

    // DIAGNOSTIC: wait for ANY response to /entry/update (not just 200)
    // so we can see what status it returned. Then assert separately.
    const resp = await page.waitForResponse((r) =>
      r.url().endsWith("/entry/update"),
    );
    const respBody = await resp.text().catch(() => "<no body>");
    console.log(
      `[diag] /entry/update FINAL status=${resp.status()} body=${respBody.slice(0, 600)}`,
    );
    if (resp.status() !== 200) {
      throw new Error(
        `Expected /entry/update 200, got ${resp.status()}: ${respBody}`,
      );
    }

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
