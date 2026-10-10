import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

/**
 * Seeded by globalSetup: one approved root more than a page holds, so the
 * oldest is only reachable through the load-more island.
 */
interface Fixtures {
  readonly loadMoreSlug: string;
  readonly oldestRootId: number;
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

/**
 * Absolute, because the rig's `baseURL` is the admin SPA's own root and
 * this is a public page the worker renders.
 */
const post = (slug: string) => `/posts/${slug}`;

test("loads the older root comments the first page left out", async ({
  page,
}) => {
  await page.goto(post(fixtures.loadMoreSlug));
  const oldest = `comment-item-${String(fixtures.oldestRootId)}`;
  await expect(page.getByTestId("comments-list")).toBeVisible();
  await expect(page.getByTestId(oldest)).toHaveCount(0);

  // `client="visible"`: the island hydrates once it scrolls into view, and
  // a press before then lands on inert server markup.
  await page.getByTestId("comments-load-more").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("comments-older")).toHaveAttribute(
    "data-live",
    "",
  );
  await page.getByTestId("comments-load-more").click();

  await expect(
    page.getByTestId("comments-more").getByTestId(oldest),
  ).toContainText("older root 1");
  // The last page said there were no more.
  await expect(page.getByTestId("comments-load-more")).toHaveCount(0);
});
