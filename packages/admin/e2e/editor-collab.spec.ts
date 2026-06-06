// Concurrency + history surfaces around the editor: the stale-draft
// resolver dialog (autosave anchored against an older live row),
// revision preview mode via `?revision=<id>`, and the co-author
// indicator fed by `entry.activity.list` polling.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { publishedEntry, publishedEntryRpcBody } from "./support/editor.js";
import { AUTHED_ADMIN, mockManifest, mockRpc } from "./support/rpc-mock.js";

const T_LIVE = new Date("2026-05-22T12:00:00Z");
const T_STALE = new Date("2026-05-22T10:00:00Z"); // before live
const T_FRESH = new Date("2026-05-22T13:00:00Z"); // after live

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

test.use({ viewport: { width: 1280, height: 900 } });

async function installAutosaveMocks(
  page: Page,
  opts: { autosaveUpdatedAt: Date | null },
): Promise<void> {
  await mockManifest(page, MANIFEST_WITH_AUTOSAVE);
  await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
  await page.route("**/_plumix/rpc/entry/get", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: publishedEntryRpcBody(
        publishedEntry({
          autosaveUpdatedAt: opts.autosaveUpdatedAt,
          liveUpdatedAt: T_LIVE,
        }),
      ),
    }),
  );
}

test.describe("stale-draft dialog", () => {
  test("stale autosave: dialog fires at mount with the three actions", async ({
    page,
  }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await expect(page.getByTestId("stale-draft-use-mine")).toBeEnabled();
    await expect(page.getByTestId("stale-draft-use-theirs")).toBeEnabled();
    await expect(page.getByTestId("stale-draft-compare")).toBeEnabled();
  });

  test("fresh autosave (newer than live): no dialog", async ({ page }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_FRESH });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
  });

  test("no autosave: no dialog", async ({ page }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: null });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
  });

  test("Use mine dismisses the dialog and lets the editor proceed with the autosave content", async ({
    page,
  }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
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
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await page.getByTestId("stale-draft-compare").click();
    await expect(page.getByTestId("stale-draft-compare-panes")).toBeVisible();
  });
});

test.describe("revision preview mode", () => {
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

  function entryBody(entry: Record<string, unknown>): string {
    return JSON.stringify({
      json: entry,
      meta: [
        [1, "createdAt"],
        [1, "updatedAt"],
      ],
    });
  }

  async function installPreviewMocks(page: Page): Promise<void> {
    await mockManifest(page, MANIFEST_WITH_REVISIONS);
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: entryBody(liveEntry()),
      }),
    );
    await page.route("**/_plumix/rpc/entry/revisions/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: entryBody(revisionRow()),
      }),
    );
  }

  test("?revision=N renders the preview banner and hides the publish button", async ({
    page,
  }) => {
    await installPreviewMocks(page);
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
  });

  test("Back to live clears the search param", async ({ page }) => {
    await installPreviewMocks(page);
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

test.describe("co-author indicator", () => {
  const T_30S_AGO = new Date("2026-05-22T11:59:30Z");

  async function installActivityMocks(
    page: Page,
    opts: {
      coAuthors: readonly {
        id: number;
        name: string | null;
        email: string;
        lastSeenAt: Date;
      }[];
    },
  ): Promise<void> {
    await installAutosaveMocks(page, { autosaveUpdatedAt: null });
    await page.route("**/_plumix/rpc/entry/activity/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { users: opts.coAuthors },
          meta: opts.coAuthors.map((_, i) => [1, "users", i, "lastSeenAt"]),
        }),
      }),
    );
  }

  test("renders the indicator when activity.list returns co-authors", async ({
    page,
  }) => {
    await installActivityMocks(page, {
      coAuthors: [
        {
          id: 7,
          name: "Ada Lovelace",
          email: "ada@example.test",
          lastSeenAt: T_30S_AGO,
        },
      ],
    });
    await page.goto("entries/posts/1/edit");
    const indicator = page.getByTestId("coauthor-indicator");
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText("Ada Lovelace");
  });

  test("no indicator when activity.list returns an empty user list", async ({
    page,
  }) => {
    await installActivityMocks(page, { coAuthors: [] });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("coauthor-indicator")).toHaveCount(0);
  });
});
