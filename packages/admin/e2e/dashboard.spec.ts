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
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /browse posts/i }),
    ).toHaveAttribute("href", /\/content\/posts/);
    await expectNoAxeViolations(page);
  });

  test("renders the empty-state card when no post types are registered", async ({
    page,
  }) => {
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("");
    await expect(page.getByText("No content types yet")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
