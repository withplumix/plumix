import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { AUTHED_ADMIN, mockRpc } from "./support/rpc-mock.js";

test.describe("/posts", () => {
  test("renders skeleton rows while loading, with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    // Deferred promise: we control when /post/list resolves, letting the
    // page sit in its loading state while axe runs, then releasing it so
    // Playwright's teardown isn't waiting on a pending request.
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/post/list")) {
        await pending;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [], meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("posts?status=all&page=1");
    await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: /loading posts/i }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    release?.();
  });

  test("renders empty state with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/post/list": [],
    });
    await page.goto("posts?status=all&page=1");
    await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
    await expect(page.getByText("No posts yet")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("renders rows with zero WCAG 2.1 AA violations", async ({ page }) => {
    const now = new Date("2026-04-19T12:00:00Z").toISOString();
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/post/list": [
        {
          id: 1,
          type: "post",
          parentId: null,
          title: "Hello world",
          slug: "hello-world",
          content: null,
          excerpt: null,
          status: "published",
          authorId: 1,
          menuOrder: 0,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 2,
          type: "post",
          parentId: null,
          title: "Draft in progress",
          slug: "draft-in-progress",
          content: null,
          excerpt: null,
          status: "draft",
          authorId: 1,
          menuOrder: 0,
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.goto("posts?status=all&page=1");
    await expect(page.getByText("Hello world")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
