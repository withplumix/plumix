import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

/**
 * WCAG 2.1 AA, scoped to the form: the playground theme's own violations are
 * not findings about the plugin.
 */
export async function expectFormHasNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include("[data-plumix-form]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
