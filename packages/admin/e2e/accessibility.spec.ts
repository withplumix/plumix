import type { Page, Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The e2e webServer is just Vite — no real backend — so every /_plumix/rpc
// call is intercepted here and answered with a deterministic fixture.
// Each test declares the shape it wants from `auth.session` (and any other
// procedure) so route `beforeLoad` + component queries resolve without
// hitting the network.

interface SessionBody {
  user: {
    id: number;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: string;
  } | null;
  needsBootstrap: boolean;
}

// oRPC's StandardRPCSerializer wire format — `meta` is always present,
// empty array for payloads with no BigInt/Date/etc. transforms.
function rpcOk(page: Page, route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ json: body, meta: [] }),
  });
}

async function mockRpc(
  page: Page,
  handlers: Record<string, unknown>,
): Promise<void> {
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    for (const [suffix, body] of Object.entries(handlers)) {
      if (url.endsWith(suffix)) {
        return rpcOk(page, route, body);
      }
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

function mockSession(page: Page, body: SessionBody): Promise<void> {
  return mockRpc(page, { "/auth/session": body });
}

test.describe("admin accessibility", () => {
  test("bootstrap route has zero WCAG 2.1 AA violations", async ({ page }) => {
    await mockSession(page, { user: null, needsBootstrap: true });
    await page.goto("bootstrap");
    await expect(
      page.getByRole("heading", { name: "Create admin account" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("login route has zero WCAG 2.1 AA violations", async ({ page }) => {
    await mockSession(page, { user: null, needsBootstrap: false });
    await page.goto("login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("authed dashboard has zero WCAG 2.1 AA violations", async ({ page }) => {
    await mockSession(page, {
      user: {
        id: 1,
        email: "admin@example.test",
        name: "Admin",
        avatarUrl: null,
        role: "admin",
      },
      needsBootstrap: false,
    });
    await page.goto("");
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("posts list (empty state) has zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 1,
          email: "admin@example.test",
          name: "Admin",
          avatarUrl: null,
          role: "admin",
        },
        needsBootstrap: false,
      },
      "/post/list": [],
    });
    await page.goto("posts?status=all&page=1");
    await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
    await expect(page.getByText("No posts yet")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("posts list (with rows) has zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    const now = new Date("2026-04-19T12:00:00Z").toISOString();
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 1,
          email: "admin@example.test",
          name: "Admin",
          avatarUrl: null,
          role: "admin",
        },
        needsBootstrap: false,
      },
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

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
