import { expect, test } from "@playwright/test";

test("counter island hydrates from the dev server and click increments", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto("http://localhost:5173/");
  const btn = page.getByTestId("counter-header");
  await expect(btn).toHaveText("header: 0");
  await btn.click();
  await expect(btn).toHaveText("header: 1");
  await btn.click();
  await expect(btn).toHaveText("header: 2");
  expect(consoleErrors).toEqual([]);
});

test("page contains the islands runtime bootstrap script", async ({
  request,
}) => {
  const html = await (await request.get("http://localhost:5173/")).text();
  expect(html).toMatch(/<script type="module" src="[^"]*islands-entry\.ts"/);
  expect(html).toContain("<plumix-island");
});
