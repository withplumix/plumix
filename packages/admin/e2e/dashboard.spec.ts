import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { AUTHED_ADMIN, mockSession } from "./support/rpc-mock.js";

test.describe("/ (dashboard)", () => {
  test("renders authed landing with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("");
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
