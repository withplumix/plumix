import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

// WCAG 2.1 AA, scoped to the form the plugin renders. Scoped rather than
// whole-page on purpose: what this suite commits to is the markup this
// plugin owns, and a violation in the playground's own theme is not a
// finding about the form.
export async function expectFormHasNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include("[data-plumix-form]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
