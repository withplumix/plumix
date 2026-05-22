// E2E + visual verification for #291 slice 2 — stale-draft resolver
// dialog. Fires at editor mount when the autosave was anchored
// against an older live row than what's on the server now.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { AUTHED_ADMIN, mockManifest, rpcOkBody } from "./support/rpc-mock.js";

const T_LIVE = new Date("2026-05-22T12:00:00Z");
const T_AUTOSAVE_OLD = new Date("2026-05-22T10:00:00Z"); // before live
const T_AUTOSAVE_FRESH = new Date("2026-05-22T13:00:00Z"); // after live

const MANIFEST_WITH_AUTOSAVE: PlumixManifest = {
  ...emptyManifest(),
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Post", plural: "Posts" },
      supports: ["title", "editor", "revisions", "autosave"],
    },
  ],
};

function publishedEntry(opts: {
  hasAutosave: boolean;
  autosaveUpdatedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: opts.hasAutosave ? "Pending edit" : "Live title",
    slug: "entry-1",
    content: null,
    excerpt: null,
    status: "published",
    authorId: 1,
    sortOrder: 0,
    publishedAt: T_LIVE,
    createdAt: T_LIVE,
    updatedAt: T_LIVE,
    meta: {},
    _preview: opts.hasAutosave
      ? {
          source: "autosave",
          autosaveUpdatedAt: opts.autosaveUpdatedAt,
          liveUpdatedAt: T_LIVE,
        }
      : { source: "live", autosaveUpdatedAt: null, liveUpdatedAt: T_LIVE },
    terms: {},
  };
}

async function installMocks(
  page: Page,
  opts: { hasAutosave: boolean; autosaveUpdatedAt: Date | null },
): Promise<void> {
  await mockManifest(page, MANIFEST_WITH_AUTOSAVE);
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/auth/session")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(AUTHED_ADMIN),
      });
    }
    if (url.endsWith("/entry/get")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: publishedEntry(opts),
          meta: [
            [1, "createdAt"],
            [1, "updatedAt"],
            [1, "publishedAt"],
            [1, "_preview", "liveUpdatedAt"],
            ...(opts.hasAutosave && opts.autosaveUpdatedAt
              ? [[1, "_preview", "autosaveUpdatedAt"]]
              : []),
          ],
        }),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

test.describe("stale-draft dialog (#291 slice 2)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("stale autosave: dialog fires at mount with the three actions", async ({
    page,
  }) => {
    await installMocks(page, {
      hasAutosave: true,
      autosaveUpdatedAt: T_AUTOSAVE_OLD,
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await expect(page.getByTestId("stale-draft-use-mine")).toBeEnabled();
    await expect(page.getByTestId("stale-draft-use-theirs")).toBeEnabled();
    await expect(page.getByTestId("stale-draft-compare")).toBeEnabled();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "tmp/stale-draft-dialog.png",
      fullPage: false,
    });
  });

  test("fresh autosave (newer than live): no dialog", async ({ page }) => {
    await installMocks(page, {
      hasAutosave: true,
      autosaveUpdatedAt: T_AUTOSAVE_FRESH,
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
  });

  test("no autosave: no dialog", async ({ page }) => {
    await installMocks(page, { hasAutosave: false, autosaveUpdatedAt: null });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
  });

  test("Use mine dismisses the dialog and lets the editor proceed with the autosave content", async ({
    page,
  }) => {
    await installMocks(page, {
      hasAutosave: true,
      autosaveUpdatedAt: T_AUTOSAVE_OLD,
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await page.getByTestId("stale-draft-use-mine").click();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
    // Title input still shows the autosave value the route was seeded
    // with — user explicitly chose to keep their draft.
    await expect(page.getByTestId("plumix-editor-title-input")).toHaveValue(
      "Pending edit",
    );
  });

  test("Compare expands an inline side-by-side JSON diff", async ({ page }) => {
    await installMocks(page, {
      hasAutosave: true,
      autosaveUpdatedAt: T_AUTOSAVE_OLD,
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await page.getByTestId("stale-draft-compare").click();
    await expect(page.getByTestId("stale-draft-compare-panes")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "tmp/stale-draft-compare.png",
      fullPage: false,
    });
  });
});
