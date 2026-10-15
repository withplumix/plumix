import { expect, test } from "@plumix/core/test/playwright";

// The `server-error` page's template throws `new Error("<b>server error</b>")`.
test.describe("the dev error page", () => {
  test("the dev error page opens on the first frame's source", async ({
    page,
  }) => {
    await page.goto("/server-error");

    await expect(
      page.getByTestId("plumix-dev-error-frame").first(),
    ).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("plumix-dev-error-source")).toContainText(
      "throw new Error(",
    );
  });

  test("choosing another frame shows its source", async ({ page }) => {
    await page.goto("/server-error");
    await expect(page.getByTestId("plumix-dev-error-source")).toContainText(
      "throw new Error(",
    );

    await page.getByTestId("plumix-dev-error-frame").nth(1).click();

    await expect(
      page.getByTestId("plumix-dev-error-frame").nth(1),
    ).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("plumix-dev-error-source")).toContainText(
      "FIXTURES[data.entry.slug]?.()",
    );
  });

  test("source markup shows as text", async ({ page }) => {
    await page.goto("/server-error");

    await expect(page.getByTestId("plumix-dev-error-source")).toContainText(
      'throw new Error("<b>server error</b>");',
    );
  });

  test("a source that won't load says so", async ({ page }) => {
    await page.route("**/@plumix-dev-error-source?**", (route) =>
      route.abort(),
    );

    await page.goto("/server-error");

    await expect(page.getByTestId("plumix-dev-error-source")).toContainText(
      "Could not load source",
    );
  });
});
