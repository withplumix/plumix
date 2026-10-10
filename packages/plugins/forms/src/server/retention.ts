import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, eq, gte, lt, max, or, rowsAffected, sql } from "plumix/db";

import type { FormRegistry } from "../registry.js";
import { formSubmissions } from "../db/schema.js";

export const RETENTION_CRON = "0 3 * * *";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `created_at` is unindexed, so filtering on it scans the backlog. Walking
 * `(form, id)` oldest-first stops at the first kept row.
 */
function firstKeptId(db: AppContext["db"], slug: string, cutoff: Date): SQL {
  const kept = db
    .select({ id: formSubmissions.id })
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.form, slug),
        gte(formSubmissions.createdAt, cutoff),
      ),
    )
    .orderBy(formSubmissions.id)
    .limit(1);
  // With nothing kept, bound past the last row: a null bound would make
  // the comparison null and delete nothing.
  const lastId = db
    .select({ id: max(formSubmissions.id) })
    .from(formSubmissions)
    .where(eq(formSubmissions.form, slug));
  return sql`coalesce((${kept}), (${lastId}) + 1)`;
}

/**
 * Whatever their status. Undeclared slugs are left alone. A row backdated
 * by a direct write is kept until the rows stored before it expire.
 */
export async function purgeExpiredSubmissions(
  ctx: AppContext,
  registry: FormRegistry,
  now = new Date(),
): Promise<number> {
  const expired: SQL[] = [];
  for (const form of registry.list()) {
    const days = registry.retentionDaysFor(form);
    if (days <= 0) continue;
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY);
    const condition = and(
      eq(formSubmissions.form, form.slug),
      lt(formSubmissions.createdAt, cutoff),
      lt(formSubmissions.id, firstKeptId(ctx.db, form.slug, cutoff)),
    );
    if (condition) expired.push(condition);
  }
  if (expired.length === 0) return 0;

  // Not `RETURNING`: the first sweep is unbounded, and 200k ids cost
  // ~106 MB of heap.
  return rowsAffected(
    await ctx.db.delete(formSubmissions).where(or(...expired)),
  );
}
