import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { entryChanges } from "../db/schema/entry_changes.js";
import { users } from "../db/schema/users.js";
import { factoriesFor } from "./factories.js";
import { CORE_MIGRATIONS } from "./harness.js";
import { createSiteDatabase } from "./site-database.js";

/** A trigger's target table made before the table the trigger is on. */
const TRIGGER_WRITTEN = fileURLToPath(
  new URL("fixtures/trigger-written/migrations", import.meta.url),
);

describe("resetting the site database", () => {
  test("leaves no rows the change feed's triggers wrote", async () => {
    const { db, reset } = await createSiteDatabase([CORE_MIGRATIONS]);
    await factoriesFor(db).published.createList(2);

    await reset();

    expect(await db.select().from(entryChanges)).toEqual([]);
  });

  test("leaves no rows a trigger wrote into a table made before its own", async () => {
    const { db, reset } = await createSiteDatabase([
      CORE_MIGRATIONS,
      TRIGGER_WRITTEN,
    ]);
    await db.run(sql`INSERT INTO notes (body) VALUES ('first'), ('second')`);

    await reset();

    expect(await db.all(sql`SELECT * FROM note_log`)).toEqual([]);
  });

  test("leaves db.transaction and db.batch working", async () => {
    const { db, reset } = await createSiteDatabase([CORE_MIGRATIONS]);
    await factoriesFor(db).admin.create();
    await reset();
    await factoriesFor(db).admin.create({ name: "Before" });

    await db.transaction(async (tx) => {
      await tx.update(users).set({ name: "In a transaction" });
    });
    await db.batch([db.update(users).set({ name: "In a batch" })]);

    expect(await db.select({ name: users.name }).from(users)).toEqual([
      { name: "In a batch" },
    ]);
  });

  test("fails, naming the cause, while a transaction is open", async () => {
    const { db, reset } = await createSiteDatabase([CORE_MIGRATIONS]);
    let finish = (): void => undefined;
    const open = db.transaction(async (tx) => {
      await tx.run(sql`SELECT 1`);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await new Promise((resolve) => setImmediate(resolve));

    await expect(reset()).rejects.toThrow(
      "A transaction is still open, so the test database cannot be reset. Commit or roll back every transaction a test opens before it ends.",
    );
    finish();
    await open;
  });
});
