import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { expect, openPlaygroundDb, test } from "plumix/test/playwright";

const PLAYGROUND = resolve(import.meta.dirname, "../playground");

const count = async (sql: string): Promise<number> => {
  const db = await openPlaygroundDb({ cwd: PLAYGROUND });
  try {
    return Number((await db.$client.execute(sql)).rows[0]?.n);
  } finally {
    db.$client.close();
  }
};

// The local D1 `plumix dev` serves on workerd, wiped under the running site:
// a user, and a table no migration created that references users.
test("plumix migrate fresh drops the local D1's tables and the site starts over", async ({
  page,
}) => {
  const db = await openPlaygroundDb({ cwd: PLAYGROUND });
  await factoriesFor(db).user.create({
    email: "admin@example.test",
    role: "admin",
  });
  await db.$client.execute(
    "CREATE TABLE leftover (user_id integer REFERENCES users (id) ON DELETE CASCADE)",
  );
  await db.$client.execute("INSERT INTO leftover SELECT id FROM users");
  db.$client.close();

  const fresh = spawnSync(
    "pnpm",
    ["exec", "plumix", "migrate", "fresh", "--yes"],
    { cwd: PLAYGROUND, encoding: "utf8" },
  );

  expect(fresh.status, fresh.stderr).toBe(0);
  expect(fresh.stderr).toContain("  leftover");
  expect(
    await count(
      "SELECT count(*) AS n FROM sqlite_master WHERE name = 'leftover'",
    ),
  ).toBe(0);
  expect(await count("SELECT count(*) AS n FROM users")).toBe(0);
  expect(
    await count("SELECT count(*) AS n FROM __drizzle_migrations_core"),
  ).toBeGreaterThan(0);
  // The admin root sends a site with no users to the bootstrap form.
  await page.goto("./");
  await expect(page.getByTestId("bootstrap-heading")).toBeVisible();
});
