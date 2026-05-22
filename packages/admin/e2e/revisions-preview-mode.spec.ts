// E2E + visual verification for slice 2 of #289 — editor preview mode
// via `?revision=<id>`. Covers the acceptance criterion: navigating
// to the preview URL renders the banner read-only, Back-to-live
// clears the param, and the canvas write affordances are gone.

import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { AUTHED_ADMIN, mockManifest, rpcOkBody } from "./support/rpc-mock.js";

const T0 = new Date("2026-05-22T00:00:00Z");
const T_REV = new Date("2026-05-22T10:00:00Z");

const MANIFEST_WITH_REVISIONS: PlumixManifest = {
  ...emptyManifest(),
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Post", plural: "Posts" },
      supports: ["title", "editor", "revisions"],
    },
  ],
};

function liveEntry(): Record<string, unknown> {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: "Live title",
    slug: "entry-1",
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
  };
}

function revisionRow(): Record<string, unknown> {
  return {
    id: 42,
    type: "_rev:post",
    parentId: null,
    title: "Snapshot title",
    slug: "rev:1:42",
    content: { version: "plumix.v2", blocks: [] },
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T_REV,
    updatedAt: T_REV,
    meta: {},
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.test",
  };
}

async function installMocks(
  page: import("@playwright/test").Page,
): Promise<void> {
  await mockManifest(page, MANIFEST_WITH_REVISIONS);
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
          json: liveEntry(),
          meta: [
            [1, "createdAt"],
            [1, "updatedAt"],
          ],
        }),
      });
    }
    if (url.endsWith("/entry/revisions/get")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: revisionRow(),
          meta: [
            [1, "createdAt"],
            [1, "updatedAt"],
          ],
        }),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

test.describe("editor preview mode (#289 slice 2)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("?revision=N renders the preview banner and hides the publish button", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("entries/posts/1/edit?revision=42");
    const banner = page.getByTestId("revision-preview-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Ada Lovelace");
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("plumix-editor-preview-shield"),
    ).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "tmp/preview-mode.png",
      fullPage: false,
    });
  });

  test("Back to live clears the search param", async ({ page }) => {
    await installMocks(page);
    await page.goto("entries/posts/1/edit?revision=42");
    await expect(page.getByTestId("revision-preview-banner")).toBeVisible();
    await page.getByTestId("revision-preview-back-to-live").click();
    await expect.poll(() => page.url()).not.toContain("revision=");
    await expect(page.getByTestId("revision-preview-banner")).toHaveCount(0);
    await expect(
      page.getByTestId("plumix-editor-publish-button"),
    ).toBeVisible();
  });
});
