import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

type AxeViolations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

/** Against WCAG 2.1 AA, the bar the admin holds every screen to. */
export async function axeViolations(page: Page): Promise<AxeViolations> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations;
}

/**
 * Call once the page has rendered its critical content, so axe sees it settled.
 */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  expect(await axeViolations(page)).toEqual([]);
}
