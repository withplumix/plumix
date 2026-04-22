import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockSession,
} from "./support/rpc-mock.js";

test.describe("/ (dashboard)", () => {
  test("renders content tiles from the manifest with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("");
    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-post-link")).toHaveAttribute(
      "href",
      /\/entries\/posts/,
    );
    await expectNoAxeViolations(page);
  });

  test("renders the empty-state card when no post types are registered", async ({
    page,
  }) => {
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("");
    await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
