import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, inArray, publicEntryRows, sql } from "plumix/db";
import { entries } from "plumix/schema";

/** `null` when the site has no public entry type. */
export function searchableEntryRows(
  ctx: AppContext,
  types: readonly string[],
): SQL | null {
  const listed = publicEntryRows(ctx.plugins);
  if (listed === null) return null;
  return sql`(${and(listed, inArray(entries.type, types))})`;
}
