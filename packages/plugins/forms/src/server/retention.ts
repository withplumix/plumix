import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, eq, gte, lt, max, or, rowsAffected, sql } from "plumix/db";

import type { FormRegistry } from "../registry.js";
import { formSubmissions } from "../db/schema.js";

/**
 * When the purge runs. One nightly task for every form on the site
 * rather than a schedule per form: a form's retention is a number of
 * days, and no site needs two of them purged at different hours.
 *
 * It must byte-match a `wrangler` `triggers.crons` entry to fire at all,
 * so it is the same nightly string the scaffolded worker already
 * declares.
 */
export const RETENTION_CRON = "0 3 * * *";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The first row of a form the cutoff does not reach — the point the
 * sweep below stops at.
 *
 * `created_at` is in no index, so a `form = ? AND created_at < ?`
 * condition on its own reads everything: one arm walks that form's whole
 * backlog on `(form, id)`, and several arms OR'd together drop to a
 * plain table scan. Either way a three-form site reads 200,000 rows to
 * delete 700, and reads the same 200,000 on a night with nothing to
 * purge at all. Asking for one id instead walks the backlog oldest-first
 * and stops at the first row still inside the period, so it steps over
 * the rows about to go and nothing else. That is also why the sweep
 * costs about twice what it deletes: it reads those rows to find the
 * bound, then again to delete them.
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
  // Nothing kept means the whole backlog goes, so the bound falls past
  // the form's last row rather than removing itself — a null one would
  // make the comparison null and delete nothing. A form with no rows at
  // all has no last row either, and the arm matches nothing, which is
  // the same answer by a shorter route.
  const lastId = db
    .select({ id: max(formSubmissions.id) })
    .from(formSubmissions)
    .where(eq(formSubmissions.form, slug));
  return sql`coalesce((${kept}), (${lastId}) + 1)`;
}

/**
 * Delete every submission a form has held longer than its declared
 * `retentionDays`, whatever status it is under — an archived enquiry is
 * still the visitor's address.
 *
 * A form keeping its submissions indefinitely contributes no condition,
 * and with none at all nothing is asked of the database: a `DELETE` with
 * no `WHERE` would empty the table. A slug nobody declares any more is
 * likewise left alone — the period is the form's, and there is no longer
 * a form to read one from.
 *
 * Each arm is bounded by id as well as by date, which is what keeps the
 * sweep off the rows it is keeping — see {@link firstKeptId}. Id is
 * arrival order for every row this plugin writes, because
 * `FormSubmissionCandidate` carries no `createdAt` and the column takes
 * its `unixepoch()` default. A row backdated by a direct write or an
 * import sits outside that order: it is kept rather than deleted, and
 * goes once the rows stored before it have expired too.
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

  // Counted off the driver rather than by asking for every deleted id
  // back: the first sweep after a site sets a period is unbounded, and
  // 200k ids cost ~106 MB of heap to measure a number the driver is
  // already holding.
  return rowsAffected(
    await ctx.db.delete(formSubmissions).where(or(...expired)),
  );
}
