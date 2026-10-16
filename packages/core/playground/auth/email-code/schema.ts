import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

/** One row per code sent. Only the code's hash is stored. */
export const emailCodes = sqliteTable(
  "email_codes",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    email: t.text().notNull(),
    codeHash: t.text().notNull(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    index("email_codes_email_created_idx").on(table.email, table.createdAt),
  ],
);

/** One row per wrong guess at a code, deleted with the code. */
export const emailCodeMisses = sqliteTable(
  "email_code_misses",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    codeId: t
      .integer()
      .notNull()
      .references(() => emailCodes.id, { onDelete: "cascade" }),
  }),
  (table) => [index("email_code_misses_code_idx").on(table.codeId)],
);
