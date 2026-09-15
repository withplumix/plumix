import type { SQL } from "drizzle-orm";

import type { AuthenticatedAppContext } from "../../../context/app.js";
import { and, desc, ne, or, sql } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { readableEntryRows } from "../../../entries/visibility.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryRecentActivityInputSchema } from "./schemas.js";

// Rows of every registered type the caller may read. Reserved rows
// (revision/autosave) aren't registered types, so they're excluded for free.
function readableRowsOfAnyType(
  context: AuthenticatedAppContext,
): SQL | undefined {
  return or(
    ...[...context.plugins.entryTypes.keys()].flatMap((type) => {
      const rows = readableEntryRows(context, type);
      return rows === null ? [] : [rows];
    }),
  );
}

export const stats = base.use(authenticated).handler(async ({ context }) => {
  const where = readableRowsOfAnyType(context);
  if (!where) return [];
  const rows = await context.db
    .select({
      type: entries.type,
      status: entries.status,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(entries)
    .where(where)
    .groupBy(entries.type, entries.status);
  return rows.map((row) => ({
    type: row.type,
    status: row.status,
    count: row.count,
  }));
});

export const recentActivity = base
  .use(authenticated)
  .input(entryRecentActivityInputSchema)
  .handler(async ({ input, context }) => {
    const readable = readableRowsOfAnyType(context);
    if (!readable) return [];
    return context.db
      .select({
        id: entries.id,
        type: entries.type,
        title: entries.title,
        slug: entries.slug,
        status: entries.status,
        updatedAt: entries.updatedAt,
      })
      .from(entries)
      .where(and(readable, ne(entries.status, "trash")))
      .orderBy(desc(entries.updatedAt), desc(entries.id))
      .limit(input.limit);
  });
