import { expect, test } from "plumix/test/playwright";

test("the admin opens in an enabled zh-CN, under its lang and in Chinese", async ({
  page,
}) => {
  // `?lang=` outranks the stored locale another spec may have picked. A deep
  // admin path, since the asset layer serves the bare mount's shell itself.
  await page.goto("entries/posts?lang=zh-CN");

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByTestId("status-view-all")).toHaveText("全部");
});
