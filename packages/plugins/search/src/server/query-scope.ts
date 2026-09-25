import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, inArray, publicEntryRows, sql } from "plumix/db";
import { entries } from "plumix/schema";

/**
 * The entries a visitor's search may return, as a WHERE clause: core's public
 * entries, narrowed to the types this plugin searches. What counts as public is
 * core's to say, so every reader asks it here rather than spelling it again.
 * `null` where the site has no public type, and so no entry to return.
 */
export function searchableEntryRows(
  ctx: AppContext,
  types: readonly string[],
): SQL | null {
  const listed = publicEntryRows(ctx.plugins);
  if (listed === null) return null;
  return sql`(${and(listed, inArray(entries.type, types))})`;
}
