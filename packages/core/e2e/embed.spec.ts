import { expect, test } from "@plumix/core/test/playwright";

test("clicking the facade loads the embed", async ({ page }) => {
  // The provider is a third party the suite never reaches.
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "" }),
  );
  await page.goto("/embed");
  await expect(page.getByTestId("embed-facade")).toBeVisible();
  await expect(page.getByTestId("embed-frame")).toHaveCount(0);

  await page.getByTestId("embed-facade").click();

  const frame = page.getByTestId("embed-frame");
  await expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  );
  await expect(frame).toHaveAttribute("loading", "lazy");
  await expect(frame).toHaveAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin",
  );
  await expect(frame).not.toHaveAttribute("sandbox");
});
