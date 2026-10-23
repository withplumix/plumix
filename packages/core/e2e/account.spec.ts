import { resolve } from "node:path";

import { factoriesFor } from "@plumix/core/test";
import {
  actingAs,
  expect,
  openPlaygroundDb,
  test,
} from "@plumix/core/test/playwright";

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
