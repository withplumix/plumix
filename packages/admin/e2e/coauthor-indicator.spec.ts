// E2E + visual verification for #293 slice B — co-author indicator
// in the editor header. Polls `entry.activity.list` every 30 s; when
// the response contains other users editing the same entry, the
// indicator shows up next to the autosave pill.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { AUTHED_ADMIN, mockManifest, rpcOkBody } from "./support/rpc-mock.js";

const T_LIVE = new Date("2026-05-22T12:00:00Z");
const T_30S_AGO = new Date("2026-05-22T11:59:30Z");

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

function publishedEntry(): Record<string, unknown> {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: "Live title",
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
    _preview: {
      source: "live",
      autosaveUpdatedAt: null,
      liveUpdatedAt: T_LIVE,
    },
    terms: {},
  };
}

async function installMocks(
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
          json: publishedEntry(),
          meta: [
            [1, "createdAt"],
            [1, "updatedAt"],
            [1, "publishedAt"],
            [1, "_preview", "liveUpdatedAt"],
          ],
        }),
      });
    }
    if (url.endsWith("/entry/activity/list")) {
      const lastSeenMetaPaths = opts.coAuthors.map((_, i) => [
        1,
        "users",
        i,
        "lastSeenAt",
      ]);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { users: opts.coAuthors },
          meta: lastSeenMetaPaths,
        }),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

test.describe("co-author indicator (#293 slice B)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("renders the indicator when activity.list returns co-authors", async ({
    page,
  }) => {
    await installMocks(page, {
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
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "tmp/coauthor-active.png",
      fullPage: false,
    });
  });

  test("no indicator when activity.list returns an empty user list", async ({
    page,
  }) => {
    await installMocks(page, { coAuthors: [] });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("coauthor-indicator")).toHaveCount(0);
  });
});
