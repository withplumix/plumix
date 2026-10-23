import { resolve } from "node:path";
import type { BrowserContext, Page, Response } from "@playwright/test";

import { factoriesFor } from "@plumix/core/test";
import {
  actingAs,
  expect,
  openPlaygroundDb,
  test,
} from "@plumix/core/test/playwright";

import { islandEvents, recordIslandEvents } from "./support/island-events.js";

test("a theme's account page renames the signed-in member", async ({
  context,
  page,
}) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const member = await factoriesFor(db).user.create({
    email: "member@example.test",
    name: "Old Name",
    role: "subscriber",
  });
  const { storageState } = await actingAs(db, member);
  db.$client.close();
  await context.clearCookies();
  await context.addCookies([...storageState.cookies]);
  await page.goto("/account");
  await expect(page.getByTestId("account-name-input")).toHaveValue("Old Name");

  await page.getByTestId("account-name-input").fill("New Name");
  await page.getByTestId("account-save").click();

  await expect(page.getByTestId("account-name")).toHaveText("New Name");
  await expect(page.getByTestId("account-error")).toHaveText("");
});

async function visitAsSubscriber(
  context: BrowserContext,
  page: Page,
): Promise<Response | null> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const member = await factoriesFor(db).user.create({
    email: "can@example.test",
    role: "subscriber",
  });
  const { storageState } = await actingAs(db, member);
  db.$client.close();
  await context.clearCookies();
  await context.addCookies([...storageState.cookies]);
  await recordIslandEvents(page);
  return page.goto("/account");
}

test("useCan renders the same on the server and after hydration", async ({
  context,
  page,
}) => {
  const response = await visitAsSubscriber(context, page);

  expect(await response?.text()).toContain(
    'data-testid="account-can-edit-own">true<',
  );
  await expect(page.getByTestId("account-name-input")).toBeVisible();
  await expect(page.getByTestId("account-can-edit-own")).toHaveText("true");
  expect(await islandEvents(page)).toEqual([]);
});

test("useCan turns false on sign-out", async ({ context, page }) => {
  await visitAsSubscriber(context, page);
  await expect(page.getByTestId("account-name-input")).toBeVisible();

  await page.getByTestId("account-sign-out").click();

  await expect(page.getByTestId("account-can-edit-own")).toHaveText("false");
});
