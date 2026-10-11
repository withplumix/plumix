import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

/**
 * Seeded by globalSetup: five approved roots, so the playground's
 * `rootsPerPage` of 2 splits them over three pages.
 */
interface Fixtures {
  readonly olderPagesSlug: string;
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

const THREAD = "[data-plumix-comment-list]";
const OLDER = "[data-plumix-comment-older]";
const NEWEST = "[data-plumix-comment-newest]";

/**
 * Absolute, because the rig's `baseURL` is the admin SPA's own root and
 * this is a public page the worker renders.
 */
const post = (slug: string) => `/posts/${slug}`;

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("pages through older comments by their links", async ({ page }) => {
    await page.goto(post(fixtures.olderPagesSlug));
    await expect(page.locator(THREAD)).toContainText("older root 5");
    await expect(page.locator(THREAD)).toContainText("older root 4");
    await expect(page.locator(THREAD)).not.toContainText("older root 3");
    await expect(page.locator(NEWEST)).toHaveCount(0);

    await Promise.all([
      page.waitForURL(/\?comments=/),
      page.locator(OLDER).click(),
    ]);
    await expect(page.locator(THREAD)).toContainText("older root 3");
    await expect(page.locator(THREAD)).toContainText("older root 2");
    await expect(page.locator(THREAD)).not.toContainText("older root 4");
    await expect(page.locator(OLDER)).toBeVisible();
    await expect(page.locator(NEWEST)).toBeVisible();

    await Promise.all([
      page.waitForURL(/\?comments=/),
      page.locator(OLDER).click(),
    ]);
    await expect(page.locator(THREAD)).toContainText("older root 1");
    await expect(page.locator(OLDER)).toHaveCount(0);
    await expect(page.locator(NEWEST)).toBeVisible();
  });
});

test("appends older comments inline without leaving the page", async ({
  page,
}) => {
  await page.goto(post(fixtures.olderPagesSlug));
  const entryUrl = page.url();

  // `client="visible"`: the island hydrates once it scrolls into view, and
  // a press before then follows the link instead.
  await page.locator(OLDER).scrollIntoViewIfNeeded();
  await expect(page.locator("[data-plumix-comment-live]")).toHaveCount(1);
  await page.locator(OLDER).click();

  const appended = page.locator("[data-plumix-comment-appended]");
  await expect(appended).toContainText("older root 3");
  await expect(appended).toContainText("older root 2");
  expect(page.url()).toBe(entryUrl);
});
