import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import { index, integer, is, sqliteTable, text } from "./index.js";

describe("plumix/db", () => {
  test("builds a site table drizzle recognizes as a SQLite table", () => {
    const bookmarks = sqliteTable(
      "bookmarks",
      {
        id: integer().primaryKey({ autoIncrement: true }),
        url: text().notNull(),
      },
      (table) => [index("bookmarks_url_idx").on(table.url)],
    );

    expect(is(bookmarks, SQLiteTable)).toBe(true);
    expect(getTableConfig(bookmarks).indexes[0]?.config.name).toBe(
      "bookmarks_url_idx",
    );
  });
});
