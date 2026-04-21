import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { mockSession } from "./support/rpc-mock.js";

test.describe("/bootstrap", () => {
  test("renders first-admin form with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockSession(page, { user: null, needsBootstrap: true });
    await page.goto("bootstrap");
    await expect(page.getByTestId("bootstrap-heading")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
