import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

/**
 * `islandEmail` already has an approved comment, so the `first_time` policy
 * approves what this spec posts.
 */
interface Fixtures {
  readonly islandSlug: string;
  readonly islandEmail: string;
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

const ENHANCED = "[data-plumix-comment-form-enhanced]";
const CONFIRMATION = "[data-plumix-comment-confirmation]";
const control = (name: string) => `[data-plumix-comment-control="${name}"]`;
const SUBMIT = "[data-plumix-comment-submit]";

/**
 * Absolute, because the rig's `baseURL` is the admin SPA's own root and
 * this is a public page the worker renders.
 */
const post = (slug: string) => `/posts/${slug}`;

test("posts a comment without leaving the page and says it was posted", async ({
  page,
}) => {
  await page.goto(post(fixtures.islandSlug));
  const entryUrl = page.url();
  // A press before hydration posts the plain form, which leaves the page.
  await expect(page.locator(ENHANCED)).toHaveCount(1);

  await page.fill(control("name"), "Lin");
  await page.fill(control("email"), fixtures.islandEmail);
  await page.fill(control("body"), "posted from the island");
  await page.click(SUBMIT);

  await expect(page.locator(CONFIRMATION)).toContainText("has been posted");
  expect(page.url()).toBe(entryUrl);
});
