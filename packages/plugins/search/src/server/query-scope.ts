import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, inArray, publicEntryRows, sql } from "plumix/db";
import { entries } from "plumix/schema";

/** `null` when the site has no public entry type. */
export async function searchableEntryRows(
  ctx: AppContext,
  types: readonly string[],
): Promise<SQL | null> {
  const listed = await publicEntryRows(ctx);
  if (listed === null) return null;
  return sql`(${and(listed, inArray(entries.type, types))})`;
}
