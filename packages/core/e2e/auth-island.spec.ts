import { resolve } from "node:path";

import { factoriesFor } from "@plumix/core/test";
import {
  actingAs,
  expect,
  openPlaygroundDb,
  test,
} from "@plumix/core/test/playwright";

test("an auth island shows the signed-in visitor", async ({
  context,
  page,
}) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const reader = await factoriesFor(db).user.create({
    email: "reader@example.test",
    role: "subscriber",
  });
  const { storageState } = await actingAs(db, reader);
  db.$client.close();
  await context.clearCookies();
  await context.addCookies([...storageState.cookies]);

  await page.goto("/use-auth");

  await expect(page.getByTestId("use-auth-probe")).toHaveText(
    "reader@example.test",
  );
});

test.describe("in a fresh context", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an auth island shows signed out in a fresh context", async ({
    page,
  }) => {
    await page.goto("/use-auth");

    await expect(page.getByTestId("use-auth-probe")).toHaveText("signed out");
  });
});
