// E2E + visual verification for slice D of #290 — drafts-of-published
// admin UI. Acceptance criteria from the issue:
//   - Open published post → status bar replaced by 3-button header
//   - No pending draft → Discard + Publish disabled, Save Draft active
//   - Save Draft → autosave row created (server-side via slice C),
//     banner appears, Publish + Discard enable
//   - Publish → live updates, banner disappears
//   - Discard → autosave removed, banner disappears

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { AUTHED_ADMIN, mockManifest, rpcOkBody } from "./support/rpc-mock.js";

const T0 = new Date("2026-05-22T00:00:00Z");

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
  hasAutosave?: boolean;
  autosaveTitle?: string;
}): Record<string, unknown> {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: opts.hasAutosave ? (opts.autosaveTitle ?? "Pending") : "Live title",
    slug: "entry-1",
    content: null,
    excerpt: null,
    status: "published",
    authorId: 1,
    sortOrder: 0,
    publishedAt: T0,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
    _preview: opts.hasAutosave
      ? { source: "autosave", autosaveUpdatedAt: T0, liveUpdatedAt: T0 }
      : { source: "live", autosaveUpdatedAt: null, liveUpdatedAt: T0 },
    terms: {},
  };
}

interface MockOptions {
  readonly hasAutosave: boolean;
  readonly autosaveTitle?: string;
}

async function installMocks(page: Page, opts: MockOptions): Promise<void> {
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
            ...(opts.hasAutosave ? [[1, "_preview", "autosaveUpdatedAt"]] : []),
          ],
        }),
      });
    }
    if (url.endsWith("/entry/discardDraft")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: { discarded: true }, meta: [] }),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

test.describe("drafts-of-published admin UI (#290 slice D)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("published entry without an autosave: three-button header, no banner, Publish + Discard disabled", async ({
    page,
  }) => {
    await installMocks(page, { hasAutosave: false });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();
    await expect(page.getByTestId("editor-draft-publish")).toBeDisabled();
    await expect(page.getByTestId("editor-draft-discard")).toBeDisabled();
    await expect(page.getByTestId("unpublished-changes-banner")).toHaveCount(0);
    // Legacy single Publish button is gone in draft mode.
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "tmp/drafts-pristine.png",
      fullPage: false,
    });
  });

  test("published entry WITH an autosave: banner visible, all three buttons enabled", async ({
    page,
  }) => {
    await installMocks(page, {
      hasAutosave: true,
      autosaveTitle: "Pending changes",
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("unpublished-changes-banner")).toBeVisible();
    await expect(
      page
        .getByTestId("unpublished-changes-banner")
        .locator("text=unpublished"),
    ).toBeVisible();
    await expect(page.getByTestId("editor-draft-save")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-publish")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-discard")).toBeEnabled();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "tmp/drafts-pending.png",
      fullPage: false,
    });
  });
});
