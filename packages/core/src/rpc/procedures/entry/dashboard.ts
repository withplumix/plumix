import type { SQL } from "drizzle-orm";

import type { AuthenticatedAppContext } from "../../../context/app.js";
import { and, desc, eq, inArray, ne, or, sql } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryCapability } from "./lifecycle.js";
import { entryRecentActivityInputSchema } from "./schemas.js";

interface ScopedTypes {
  // Types the caller can edit_any — count/list every status.
  readonly full: string[];
  // Types the caller can only read — restricted to published, matching
  // `entry.list` / `entry.get` (read alone never exposes drafts).
  readonly publishedOnly: string[];
}

// Partition registered entry types by the caller's visibility. Reserved
// rows (revision/autosave) aren't registered types, so they're excluded
// for free. A `read`-only caller must not see draft/trash counts or
// titles — only `edit_any` widens the scope to all statuses.
function scopeTypes(context: AuthenticatedAppContext): ScopedTypes {
  const full: string[] = [];
  const publishedOnly: string[] = [];
  for (const type of context.plugins.entryTypes.values()) {
    const ns = type.capabilityType ?? type.name;
    if (!context.auth.can(entryCapability(ns, "read"))) continue;
    if (context.auth.can(entryCapability(ns, "edit_any"))) {
      full.push(type.name);
    } else {
      publishedOnly.push(type.name);
    }
  }
  return { full, publishedOnly };
}

// Visibility predicate: every status for `full` types, published-only for
// `publishedOnly` types. `extra` further constrains the full set (e.g.
// "not trash" for the activity feed). Returns undefined when nothing is
// visible so callers can short-circuit.
function visibilityClause(scope: ScopedTypes, extra?: SQL): SQL | undefined {
  // `and`/`or` drop undefined operands, so undefined branches fall away
  // and a single live branch returns itself — no assertions needed.
  const fullClause =
    scope.full.length > 0
      ? and(inArray(entries.type, scope.full), extra)
      : undefined;
  const publishedClause =
    scope.publishedOnly.length > 0
      ? and(
          inArray(entries.type, scope.publishedOnly),
          eq(entries.status, "published"),
        )
      : undefined;
  return or(fullClause, publishedClause);
}

export const stats = base.use(authenticated).handler(async ({ context }) => {
  const where = visibilityClause(scopeTypes(context));
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
    count: Number(row.count),
  }));
});

export const recentActivity = base
  .use(authenticated)
  .input(entryRecentActivityInputSchema)
  .handler(async ({ input, context }) => {
    const where = visibilityClause(
      scopeTypes(context),
      ne(entries.status, "trash"),
    );
    if (!where) return [];
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
      .where(where)
      .orderBy(desc(entries.updatedAt), desc(entries.id))
      .limit(input.limit);
  });
