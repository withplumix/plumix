import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("admin accessibility", () => {
  test("landing page has zero WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/");
    // Prove the app actually rendered — otherwise axe happily scans a blank page.
    await expect(
      page.getByRole("heading", { name: "Plumix Admin" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
