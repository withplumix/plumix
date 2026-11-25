import type { Db } from "../../../context/app-context.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { guardedTable } from "../../../db/concurrency.js";
import { contentTimestamp } from "../../../db/content-timestamp.js";
import { and, eq, getTableColumns, sql } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { ifMatchMessage } from "../../concurrency.js";

export const ENTRY_IF_MATCH_MESSAGE = ifMatchMessage("entry");

/** How the guarded writes reach `entries`. */
export function entryRows(db: Db) {
  return guardedTable<Entry, Partial<NewEntry> & { termsChanged?: boolean }>({
    kind: "entry",
    updatedAt: entries.updatedAt,
    update: async (id, { updatedAt, termsChanged, ...changes }, where) => {
      const [row] = await db
        .update(entries)
        .set({
          ...changes,
          updatedAt:
            termsChanged || Object.keys(changes).length === 0
              ? updatedAt
              : contentTimestamp(
                  entries.updatedAt,
                  getTableColumns(entries),
                  changes,
                  sql`${sql.param(updatedAt, entries.updatedAt)}`,
                ),
        })
        .where(and(eq(entries.id, id), where))
        .returning();
      return row;
    },
    read: (id) => db.query.entries.findFirst({ where: eq(entries.id, id) }),
  });
}
