import type { DrizzleD1Database } from "drizzle-orm/d1";
import { inArray } from "plumix/db";
import { users } from "plumix/schema";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { d1 } from "../../src/d1.js";

const site = await testSite({ config: { database: d1({ binding: "DB" }) } });

const ids = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index + 1);

describe("a site on D1, under test", () => {
  test("refuses a statement binding more parameters than D1 allows", async () => {
    const refused: unknown = await site.context.db
      .select()
      .from(users)
      .where(inArray(users.id, ids(150)))
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(Error);
    expect(String((refused as Error).cause)).toMatch(
      /at most 100 parameters.*binds 150.*chunkForD1.*db\.batch/,
    );
  });

  test("refuses an oversized statement sent through db.batch", async () => {
    // `Db` leaves `batch` out; a site on D1 has it, and so does its test site.
    const db = site.context.db as unknown as DrizzleD1Database;

    await expect(
      db.batch([
        db.select().from(users),
        db
          .select()
          .from(users)
          .where(inArray(users.id, ids(150))),
      ]),
    ).rejects.toThrow(/at most 100 parameters/);
  });

  test("refuses an interactive transaction", async () => {
    await expect(
      site.context.db.transaction(async (tx) => {
        await tx.select().from(users);
      }),
    ).rejects.toThrow(/interactive transaction.*db\.batch/);
  });
});
