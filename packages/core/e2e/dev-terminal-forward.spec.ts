import { expect, test } from "@plumix/core/test/playwright";

import { waitForDevClient } from "./support/dev-client.js";

test("a browser console.error reaches the dev server's client-error log", async ({
  page,
}) => {
  await page.goto("/islands");
  await waitForDevClient(page);

  await page.evaluate(() => {
    console.error("forwarded from the browser");
  });

  await expect
    .poll(async () => {
      const response = await page.request.get("/@plumix-dev-client-errors");
      const { errors } = (await response.json()) as {
        errors: readonly { message: string }[];
      };
      return errors.map((error) => error.message);
    })
    .toContain("forwarded from the browser");
});
