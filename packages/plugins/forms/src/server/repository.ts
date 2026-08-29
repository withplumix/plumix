import type { AppContext } from "plumix/plugin";
import { eq, isUniqueConstraintErrorOn, sql } from "plumix/db";

import type { FormSubmission } from "../db/schema.js";
import type { FormSubmissionCandidate } from "../types.js";
import { formSubmissions } from "../db/schema.js";
import { FormsError } from "../errors.js";

// Two writers can read the same maximum before either commits, so the
// loser hits the unique index and takes the next number. A handful of
// attempts covers far more contention than a form receives; past that the
// conflict is a bug rather than a race, and failing says so.
const SERIAL_ATTEMPTS = 5;

/**
 * Persist one submission, numbering it within its own form. There is no
 * counter to increment — the serial is computed inside the insert from
 * the rows already there, with the `(form_slug, serial)` unique index as
 * the guard and a bounded retry on conflict.
 */
export async function insertSubmission(
  ctx: AppContext,
  candidate: FormSubmissionCandidate,
): Promise<FormSubmission> {
  const { form, ...rest } = candidate;
  const nextSerial = sql<number>`(
    select coalesce(max(${formSubmissions.serial}), 0) + 1
    from ${formSubmissions}
    where ${eq(formSubmissions.formSlug, form)}
  )`;

  for (let attempt = 1; ; attempt++) {
    let row: FormSubmission | undefined;
    try {
      [row] = await ctx.db
        .insert(formSubmissions)
        .values({ ...rest, formSlug: form, serial: nextSerial })
        .returning();
    } catch (error) {
      if (
        attempt < SERIAL_ATTEMPTS &&
        isUniqueConstraintErrorOn(error, "form_submissions.form_slug")
      ) {
        continue;
      }
      throw error;
    }
    if (!row) {
      throw FormsError.insertReturnedNoRow({ slug: form });
    }
    return row;
  }
}

/**
 * Record on the row that the form's own handler threw. The submission
 * itself is untouched — it was received, and what failed was what the
 * site meant to do next with it.
 */
export async function recordHandlerFailure(
  ctx: AppContext,
  id: number,
  reason: string,
): Promise<void> {
  await ctx.db
    .update(formSubmissions)
    .set({ handlerError: reason })
    .where(eq(formSubmissions.id, id));
}
