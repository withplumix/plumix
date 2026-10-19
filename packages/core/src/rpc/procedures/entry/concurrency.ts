import type { Db } from "../../../context/app-context.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { guardedTable } from "../../../db/concurrency.js";
import { and, eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { ifMatchMessage } from "../../concurrency.js";

export const ENTRY_IF_MATCH_MESSAGE = ifMatchMessage("entry");

/** How the guarded writes reach `entries`. */
export function entryRows(db: Db) {
  return guardedTable<Entry, Partial<NewEntry>>({
    kind: "entry",
    updatedAt: entries.updatedAt,
    update: async (id, set, where) => {
      const [row] = await db
        .update(entries)
        .set(set)
        .where(and(eq(entries.id, id), where))
        .returning();
      return row;
    },
    read: (id) => db.query.entries.findFirst({ where: eq(entries.id, id) }),
  });
}
