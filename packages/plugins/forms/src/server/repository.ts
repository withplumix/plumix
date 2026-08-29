import type { SQL } from "plumix/db";
import type { AppContext } from "plumix/plugin";
import { and, count, desc, eq, getTableColumns, gte, lt, lte } from "plumix/db";

import type { FormSubmission, StoredSubmission } from "../db/schema.js";
import type {
  FormLabelSnapshot,
  FormSubmissionCandidate,
  SubmissionCounts,
  SubmissionFilter,
  SubmissionStatus,
} from "../types.js";
import { formLabelSnapshots, formSubmissions } from "../db/schema.js";
import { FormsError } from "../errors.js";
import { labelSnapshotDigest } from "./labels.js";

/**
 * Put one label snapshot where submissions can point at it, and answer
 * with the key they point with. Content-addressed, so this is an insert
 * that is usually ignored rather than a lookup followed by an insert —
 * and no submission ever has to wonder whether the snapshot it needs is
 * already there.
 */
export async function storeLabelSnapshot(
  db: AppContext["db"],
  labels: FormLabelSnapshot,
): Promise<string> {
  const digest = await labelSnapshotDigest(labels);
  await db
    .insert(formLabelSnapshots)
    .values({ digest, labels })
    .onConflictDoNothing({ target: formLabelSnapshots.digest });
  return digest;
}

/** Persist one submission, with its labels beside it rather than on it. */
export async function insertSubmission(
  ctx: AppContext,
  candidate: FormSubmissionCandidate,
): Promise<StoredSubmission> {
  const { labels, ...rest } = candidate;
  const labelsDigest = await storeLabelSnapshot(ctx.db, labels);

  const [row] = await ctx.db
    .insert(formSubmissions)
    .values({ ...rest, labelsDigest })
    .returning();
  if (!row) {
    throw FormsError.insertReturnedNoRow({ slug: candidate.form });
  }
  const { labelsDigest: _stored, ...submission } = row;
  return { ...submission, labels };
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

export const SUBMISSION_PAGE_DEFAULT = 25;
export const SUBMISSION_PAGE_MAX = 100;

export interface SubmissionRowPage {
  readonly submissions: readonly StoredSubmission[];
  /** Pass back as `cursor` for the next page; null at the end of the list. */
  readonly nextCursor: string | null;
}

function filterFor(filter: SubmissionFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.form !== undefined) {
    conditions.push(eq(formSubmissions.form, filter.form));
  }
  if (filter.status !== undefined) {
    conditions.push(eq(formSubmissions.status, filter.status));
  }
  if (filter.since !== undefined) {
    conditions.push(gte(formSubmissions.createdAt, filter.since));
  }
  if (filter.until !== undefined) {
    conditions.push(lte(formSubmissions.createdAt, filter.until));
  }
  return and(...conditions);
}

// Left rather than inner. Nothing deletes a snapshot, but no foreign key
// says so either — a direct write or a partial restore can leave a row
// pointing at one that is not there. Such a row reads under its raw keys
// rather than its labels; an inner join would drop it from the inbox
// altogether, which is the worse answer to the same accident.
function selectSubmissions(ctx: AppContext) {
  return ctx.db
    .select({
      ...getTableColumns(formSubmissions),
      labels: formLabelSnapshots.labels,
    })
    .from(formSubmissions)
    .leftJoin(
      formLabelSnapshots,
      eq(formSubmissions.labelsDigest, formLabelSnapshots.digest),
    );
}

function withLabels({
  labelsDigest: _digest,
  ...row
}: FormSubmission & { labels: FormLabelSnapshot | null }): StoredSubmission {
  return { ...row, labels: row.labels ?? {} };
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

  const rows = await selectSubmissions(ctx)
    .where(where)
    .orderBy(desc(formSubmissions.id))
    .limit(input.limit + 1);

  const submissions = rows.slice(0, input.limit).map(withLabels);
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
): Promise<readonly StoredSubmission[]> {
  const rows = await selectSubmissions(ctx)
    .where(filterFor(filter))
    .orderBy(desc(formSubmissions.id))
    .limit(limit);
  return rows.map(withLabels);
}

/**
 * The numbers beside each filter. Each facet is counted with the *other*
 * facet applied, so switching status keeps the form counts answering
 * "how many of these are there", rather than restating the page you can
 * already see.
 */
export async function countSubmissionFacets(
  ctx: AppContext,
  filter: SubmissionFilter,
): Promise<SubmissionCounts> {
  // Only the facet being grouped is dropped. The date range narrows what
  // is counted rather than being one of the answers, so it rides both.
  const [byStatus, byForm] = await Promise.all([
    ctx.db
      .select({ status: formSubmissions.status, value: count() })
      .from(formSubmissions)
      .where(filterFor({ ...filter, status: undefined }))
      .groupBy(formSubmissions.status),
    ctx.db
      .select({ form: formSubmissions.form, value: count() })
      .from(formSubmissions)
      .where(filterFor({ ...filter, form: undefined }))
      .groupBy(formSubmissions.form),
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

export async function countSubmissions(
  ctx: AppContext,
  filter: SubmissionFilter,
): Promise<number> {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(formSubmissions)
    .where(filterFor(filter));
  return row?.value ?? 0;
}

export async function getSubmission(
  ctx: AppContext,
  id: number,
): Promise<StoredSubmission | null> {
  const [row] = await selectSubmissions(ctx).where(eq(formSubmissions.id, id));
  return row ? withLabels(row) : null;
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
