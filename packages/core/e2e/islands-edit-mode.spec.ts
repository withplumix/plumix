import type { Page } from "@playwright/test";

import { expect, test } from "@plumix/core/test/playwright";

/**
 * The editor's canvas render stamps `data-plumix-mode` on `<html>`; stamping
 * the served page the same way puts the islands in that mode without an
 * editor around them.
 */
async function serveInMode(
  page: Page,
  mode: "edit" | "preview",
): Promise<void> {
  await page.route("**/islands", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace("<html", `<html data-plumix-mode="${mode}"`),
    });
  });
}

test.describe("islands in the editor", () => {
  test("an island stays static in edit mode", async ({ page }) => {
    await serveInMode(page, "edit");
    await page.goto("/islands");
    // The client-only placeholder is the runtime's own work, so it showing
    // means the runtime has started every island.
    await expect(page.getByTestId("client-only-host")).toHaveText(
      "Client-only: Probe",
    );

    await expect(page.getByTestId("load-probe-label")).toHaveText("hello");
    await expect(page.getByTestId("load-probe")).not.toHaveAttribute(
      "data-live",
    );
  });

  test("an island hydrates in preview mode", async ({ page }) => {
    await serveInMode(page, "preview");
    await page.goto("/islands");

    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");
  });

  test("a client-only island shows its placeholder in edit mode", async ({
    page,
  }) => {
    await serveInMode(page, "edit");
    await page.goto("/islands");

    await expect(page.getByTestId("client-only-host")).toHaveText(
      "Client-only: Probe",
    );
  });
});
