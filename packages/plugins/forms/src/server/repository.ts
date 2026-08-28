import type { AppContext } from "plumix/plugin";
import { eq, isUniqueConstraintErrorOn, sql } from "plumix/db";

import type { FormSubmission } from "../db/schema.js";
import type {
  FormAnswers,
  FormLabelSnapshot,
  SubmissionStatus,
} from "../types.js";
import { formSubmissions } from "../db/schema.js";
import { FormsError } from "../errors.js";

export interface SubmissionInput {
  readonly formSlug: string;
  readonly status: SubmissionStatus;
  readonly answers: FormAnswers;
  readonly labels: FormLabelSnapshot;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
}

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
  input: SubmissionInput,
): Promise<FormSubmission> {
  const nextSerial = sql<number>`(
    select coalesce(max(${formSubmissions.serial}), 0) + 1
    from ${formSubmissions}
    where ${eq(formSubmissions.formSlug, input.formSlug)}
  )`;

  for (let attempt = 1; ; attempt++) {
    let row: FormSubmission | undefined;
    try {
      [row] = await ctx.db
        .insert(formSubmissions)
        .values({ ...input, serial: nextSerial })
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
      throw FormsError.insertReturnedNoRow({ slug: input.formSlug });
    }
    return row;
  }
}
