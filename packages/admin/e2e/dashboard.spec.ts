import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockSession,
  rpcOkBody,
} from "./support/rpc-mock.js";

const STATS = [
  { type: "post", status: "published", count: 4 },
  { type: "post", status: "draft", count: 2 },
];

const T0 = new Date("2026-04-19T12:00:00Z").toISOString();
const RECENT = [
  {
    id: 1,
    type: "post",
    title: "Latest post",
    slug: "latest-post",
    status: "published",
    updatedAt: T0,
  },
];

test.describe("/ (dashboard)", () => {
  test("renders tiles, live counts and recent activity, zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/stats": STATS,
      "/entry/recentActivity": RECENT,
    });
    await page.goto("");

    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-post-link")).toHaveAttribute(
      "href",
      /\/entries\/posts/,
    );
    // Live counts from entry.stats.
    const counts = page.getByTestId("dashboard-tile-post-counts");
    await expect(counts).toContainText("4");
    await expect(counts).toContainText("2");
    // Recent activity from entry.recentActivity.
    await expect(page.getByTestId("dashboard-recent-activity")).toContainText(
      "Latest post",
    );
    await expectNoAxeViolations(page);
  });

  test("recent-activity panel shows an empty state when there's no activity", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/stats": [],
      "/entry/recentActivity": [],
    });
    await page.goto("");
    await expect(page.getByTestId("dashboard-recent-activity")).toBeVisible();
    // Zero-count tiles still render.
    await expect(page.getByTestId("dashboard-tile-post-counts")).toContainText(
      "0",
    );
  });

  test("renders the empty-state card when no post types are registered", async ({
    page,
  }) => {
    await mockSession(page, AUTHED_ADMIN);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/stats": [],
      "/entry/recentActivity": [],
    });
    await page.goto("");
    await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
