import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import {
  and,
  count,
  desc,
  eq,
  isUniqueConstraintErrorOn,
  lt,
  sql,
} from "plumix/db";

import type { FormSubmission } from "../db/schema.js";
import type {
  FormSubmissionCandidate,
  SubmissionCounts,
  SubmissionFilter,
  SubmissionStatus,
} from "../types.js";
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

export interface SubmissionRowPage {
  readonly submissions: readonly FormSubmission[];
  /** Pass back as `cursor` for the next page; null at the end of the list. */
  readonly nextCursor: string | null;
}

function filterFor(filter: SubmissionFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.form !== undefined) {
    conditions.push(eq(formSubmissions.formSlug, filter.form));
  }
  if (filter.status !== undefined) {
    conditions.push(eq(formSubmissions.status, filter.status));
  }
  return and(...conditions);
}

// `id` is autoincrement and a submission is never rewritten in place, so
// id order is arrival order: one column orders the list and carries the
// cursor, with no same-second tie for `createdAt` to break.
function decodeCursor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** One page of the inbox, newest first. */
export async function listSubmissions(
  ctx: AppContext,
  input: SubmissionFilter & {
    readonly limit: number;
    readonly cursor?: string | null;
  },
): Promise<SubmissionRowPage> {
  const cursor = decodeCursor(input.cursor);
  const where = cursor
    ? and(filterFor(input), lt(formSubmissions.id, cursor))
    : filterFor(input);

  const rows = await ctx.db
    .select()
    .from(formSubmissions)
    .where(where)
    .orderBy(desc(formSubmissions.id))
    .limit(input.limit + 1);

  const submissions = rows.slice(0, input.limit);
  const last = submissions.at(-1);
  return {
    submissions,
    nextCursor: rows.length > input.limit && last ? String(last.id) : null,
  };
}

/**
 * Every submission a filter names, newest first — what an export writes.
 * Unpaged, because the columns of a CSV come from the label snapshots of
 * the rows it holds and there is no header to write before the last row
 * has been read. `limit` is therefore a ceiling rather than a page: the
 * caller reads one past what it can serve so that too many to hold is
 * something it can say — see `createExportHandler`.
 */
export async function listAllSubmissions(
  ctx: AppContext,
  filter: SubmissionFilter,
  limit: number,
): Promise<readonly FormSubmission[]> {
  return ctx.db
    .select()
    .from(formSubmissions)
    .where(filterFor(filter))
    .orderBy(desc(formSubmissions.id))
    .limit(limit);
}

/**
 * The numbers beside each filter. Each facet is counted with the *other*
 * facet applied, so switching status keeps the form counts answering
 * "how many of these are there", rather than restating the page you can
 * already see.
 */
export async function countSubmissions(
  ctx: AppContext,
  filter: SubmissionFilter,
): Promise<SubmissionCounts> {
  const [byStatus, byForm] = await Promise.all([
    ctx.db
      .select({ status: formSubmissions.status, value: count() })
      .from(formSubmissions)
      .where(filterFor({ form: filter.form }))
      .groupBy(formSubmissions.status),
    ctx.db
      .select({ form: formSubmissions.formSlug, value: count() })
      .from(formSubmissions)
      .where(filterFor({ status: filter.status }))
      .groupBy(formSubmissions.formSlug),
  ]);

  const statuses: Record<SubmissionStatus, number> = {
    new: 0,
    read: 0,
    archived: 0,
    spam: 0,
  };
  for (const row of byStatus) statuses[row.status] = row.value;
  return {
    statuses,
    forms: Object.fromEntries(byForm.map((row) => [row.form, row.value])),
  };
}

export async function getSubmission(
  ctx: AppContext,
  id: number,
): Promise<FormSubmission | null> {
  const [row] = await ctx.db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.id, id));
  return row ?? null;
}

export async function setSubmissionStatus(
  ctx: AppContext,
  id: number,
  status: SubmissionStatus,
): Promise<FormSubmission | null> {
  const [row] = await ctx.db
    .update(formSubmissions)
    .set({ status })
    .where(eq(formSubmissions.id, id))
    .returning();
  return row ?? null;
}

/** `null` clears the note rather than storing an empty one. */
export async function setSubmissionNote(
  ctx: AppContext,
  id: number,
  note: string | null,
): Promise<FormSubmission | null> {
  const [row] = await ctx.db
    .update(formSubmissions)
    .set({ note })
    .where(eq(formSubmissions.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSubmission(
  ctx: AppContext,
  id: number,
): Promise<boolean> {
  const deleted = await ctx.db
    .delete(formSubmissions)
    .where(eq(formSubmissions.id, id))
    .returning({ id: formSubmissions.id });
  return deleted.length > 0;
}
