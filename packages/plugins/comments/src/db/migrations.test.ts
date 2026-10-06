import { sql } from "plumix/db";
import { describe, expect, test } from "vitest";

import { createCommentsTestDb } from "../test/db.js";

describe("comments' migration history", () => {
  test("adds `comments` on top of core's history, keyed to its entries and users", async () => {
    const db = await createCommentsTestDb();

    const keys = await db.all<{ table: string; from: string; to: string }>(
      sql`SELECT "table", "from", "to" FROM pragma_foreign_key_list('comments') ORDER BY "from"`,
    );

    expect(keys).toEqual([
      { table: "users", from: "author_user_id", to: "id" },
      { table: "entries", from: "entry_id", to: "id" },
      { table: "comments", from: "parent_id", to: "id" },
    ]);
  });
});
