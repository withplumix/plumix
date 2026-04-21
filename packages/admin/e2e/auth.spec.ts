import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { mockSession } from "./support/rpc-mock.js";

// Entry-into-app flows: bootstrap (first admin ever), login (returning
// user), and accept-invite (new user from invite link) belong here.
// Accept-invite end-to-end requires mocked WebAuthn — the unit-level
// coverage in `src/lib/passkey.test.ts` handles the shape contract
// today; a full e2e is a follow-up when we have passkey test infra.

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

test.describe("/login", () => {
  test("renders sign-in form with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockSession(page, { user: null, needsBootstrap: false });
    await page.goto("login");
    await expect(page.getByTestId("login-heading")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
