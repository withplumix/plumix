import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { mockSession } from "./support/rpc-mock.js";

test.describe("/login", () => {
  test("renders sign-in form with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockSession(page, { user: null, needsBootstrap: false });
    await page.goto("login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
