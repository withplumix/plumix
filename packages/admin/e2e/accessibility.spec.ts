import type { Page, Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The e2e webServer is just Vite — no real backend — so every /_plumix/rpc
// call is intercepted here and answered with a deterministic fixture.
// Each test declares the shape it wants from `auth.session` so the beforeLoad
// probe resolves without hitting the network.
function mockSessionProbe(
  page: Page,
  body: {
    user: {
      id: number;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      role: string;
    } | null;
    needsBootstrap: boolean;
  },
) {
  return page.route("**/_plumix/rpc/**", (route: Route) => {
    const url = route.request().url();
    if (url.endsWith("/auth/session")) {
      // oRPC's StandardRPCSerializer wire format — `meta` is always present,
      // empty array for payloads with no BigInt/Date/etc. transforms.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: body, meta: [] }),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

test.describe("admin accessibility", () => {
  test("bootstrap route has zero WCAG 2.1 AA violations", async ({ page }) => {
    await mockSessionProbe(page, { user: null, needsBootstrap: true });
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
    await mockSessionProbe(page, { user: null, needsBootstrap: false });
    await page.goto("login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("authed dashboard has zero WCAG 2.1 AA violations", async ({ page }) => {
    await mockSessionProbe(page, {
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
});
