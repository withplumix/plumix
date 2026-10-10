// Nothing is mocked: manifest, plugin chunk, real oRPC preview and the host's
// sibling values all have to reach the editor, which no unit test covers.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as { readonly postId: number };

const PREVIEW = "meta-box-field-seo_preview-input";
const SEARCH_TITLE = "meta-box-field-seo_title-input";
const SEARCH_DESCRIPTION = "meta-box-field-seo_description-input";
const NOINDEX = "meta-box-field-seo_noindex-input";

/**
 * The rig rewinds the database per attempt, not per test, so tests only type
 * into the form and never save.
 */
async function openSeoBox(page: Page): Promise<void> {
  await page.goto(`entries/posts/${String(fixtures.postId)}/edit`);
  await page.getByTestId("plumix-tab-page").click();
  await expect(page.getByTestId("entry-meta-box-seo")).toBeVisible();
}

test("the editor previews the entry as a search result", async ({ page }) => {
  await openSeoBox(page);

  // Registered through the plugin chunk. Without it the admin falls through to
  // its text-input fallback and this locator never resolves.
  await expect(page.getByTestId(PREVIEW)).toBeVisible();
  await expect(page.getByTestId(`${PREVIEW}-title`)).toHaveText("Hello");
  await expect(page.getByTestId(`${PREVIEW}-url`)).toContainText(
    "/posts/hello",
  );
  await expect(page.getByTestId(`${PREVIEW}-description`)).toContainText(
    "The excerpt a search engine would fall back to.",
  );
});

test("the preview and its counters follow the author's typing", async ({
  page,
}) => {
  await openSeoBox(page);
  await expect(page.getByTestId(PREVIEW)).toBeVisible();

  await page.getByTestId(SEARCH_TITLE).fill("A headline written for search");

  await expect(page.getByTestId(`${PREVIEW}-title`)).toHaveText(
    "A headline written for search",
  );
  await expect(page.getByTestId(`${PREVIEW}-title-length-count`)).toHaveText(
    "29 / 60",
  );
  await expect(page.getByTestId(`${PREVIEW}-title-length-state`)).toContainText(
    "Fits.",
  );
});

test("a title past the limit is called out as truncated", async ({ page }) => {
  await openSeoBox(page);
  await expect(page.getByTestId(PREVIEW)).toBeVisible();

  await page.getByTestId(SEARCH_TITLE).fill("x".repeat(61));

  await expect(page.getByTestId(`${PREVIEW}-title-length-count`)).toHaveText(
    "61 / 60",
  );
  await expect(page.getByTestId(`${PREVIEW}-title-length-state`)).toContainText(
    "cut it short",
  );
});

test("the description counter tracks its own field", async ({ page }) => {
  await openSeoBox(page);
  await expect(page.getByTestId(PREVIEW)).toBeVisible();

  await page.getByTestId(SEARCH_DESCRIPTION).fill("A snippet.");

  await expect(page.getByTestId(`${PREVIEW}-description`)).toHaveText(
    "A snippet.",
  );
  await expect(
    page.getByTestId(`${PREVIEW}-description-length-count`),
  ).toHaveText("10 / 155");
});

test("hiding the entry says so, in words, before it is even saved", async ({
  page,
}) => {
  await openSeoBox(page);
  await expect(page.getByTestId(PREVIEW)).toBeVisible();
  await expect(page.getByTestId(`${PREVIEW}-excluded`)).toBeHidden();

  await page.getByTestId(NOINDEX).click();

  await expect(page.getByTestId(`${PREVIEW}-excluded`)).toContainText(
    "Hidden from search engines on this entry.",
  );
});

test("the preview ships styled controls", async ({ page }) => {
  await openSeoBox(page);
  // The resolved panel, not the loading line: only the former has controls to
  // count, and under a loaded machine the query is still in flight here.
  await expect(page.getByTestId(`${PREVIEW}-title`)).toBeVisible();

  const ui = await styledControls(page, PREVIEW);
  expect(ui.total).toBeGreaterThan(0);
  expect(ui.styled).toBeGreaterThan(0);
});

/**
 * Counts the plugin control's interactive elements and how many carry a
 * styling class — a count of 0 is the unstyled-component regression signal.
 */
async function styledControls(page: Page, shellTestId: string) {
  return page.evaluate((id) => {
    const shell = document.querySelector(`[data-testid="${id}"]`);
    const controls = shell
      ? Array.from(shell.querySelectorAll("button, a, input, select, label"))
      : [];
    return {
      total: controls.length,
      styled: controls.filter(
        (el) => (el.getAttribute("class") ?? "").trim().length > 0,
      ).length,
    };
  }, shellTestId);
}
