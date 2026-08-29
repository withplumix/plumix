import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, eq, lt, or } from "plumix/db";

import type { FormDefinition } from "../define-form.js";
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
 * Delete every submission a form has held longer than its declared
 * `retentionDays`, whatever status it is under — an archived enquiry is
 * still the visitor's address.
 *
 * A form keeping its submissions indefinitely contributes no condition,
 * and with none at all nothing is asked of the database: a `DELETE` with
 * no `WHERE` would empty the table. A slug nobody declares any more is
 * likewise left alone — the period is the form's, and there is no longer
 * a form to read one from.
 */
export async function purgeExpiredSubmissions(
  ctx: AppContext,
  forms: readonly FormDefinition[],
  now = new Date(),
): Promise<number> {
  const expired: SQL[] = [];
  for (const form of forms) {
    if (form.retentionDays <= 0) continue;
    const cutoff = new Date(now.getTime() - form.retentionDays * MS_PER_DAY);
    const condition = and(
      eq(formSubmissions.formSlug, form.slug),
      lt(formSubmissions.createdAt, cutoff),
    );
    if (condition) expired.push(condition);
  }
  if (expired.length === 0) return 0;

  const deleted = await ctx.db
    .delete(formSubmissions)
    .where(or(...expired))
    .returning({ id: formSubmissions.id });
  return deleted.length;
}
