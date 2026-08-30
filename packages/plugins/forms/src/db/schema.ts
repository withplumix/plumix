import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

import type { FormAnswers, FormBound, FormLabelSnapshot } from "../types.js";
import { BOUND_TYPES, SUBMISSION_STATUSES } from "../types.js";

/**
 * One answered form. `form` carries no foreign key on purpose — a form
 * declared in config is a value in the repository, with no row to
 * reference.
 *
 * The row's quotable reference is its `id`, and no per-form number can
 * replace it: retention deletes rows, so anything counted over the ones
 * that remain is reissued once a sweep empties a form.
 *
 * `labels_digest` points at the immutable snapshot of what every field
 * and option was called, which is the whole of what keeps the row
 * readable after the form changes — see {@link formLabelSnapshots}.
 * `ip_hash` is a salted SHA-256, never a cleartext address.
 *
 * `bound_id` carries no foreign key either — a polymorphic pair cannot,
 * and a submission would not want one: it is a record of something a
 * person sent, so deleting the page it was about must not destroy it.
 *
 * SQLite decodes a row in declared order and spills the tail onto
 * overflow pages, so the columns run fixed-width first, then the two
 * open-ended text ones, then the JSON.
 */
export const formSubmissions = sqliteTable(
  "form_submissions",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    form: t.text().notNull(),
    status: t.text({ enum: SUBMISSION_STATUSES }).notNull(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => sql`(unixepoch())`),
    /**
     * What the form was bound to — real columns rather than a key buried
     * in `answers`, so "every submission for this thing" is a query on
     * an index rather than a scan that has to parse JSON. Both null when
     * nothing was bound; every writer goes through `boundColumns`, so
     * they are never half-set.
     *
     * An integer where `audit_log.subject_id` is text, because that
     * table's subject space is open and spans text-keyed tables while
     * this one is closed to the arms of `ResolvedEntity` that name a
     * row.
     */
    boundType: t.text({ enum: BOUND_TYPES }),
    boundId: t.integer(),
    ipHash: t.text(),
    userAgent: t.text(),
    labelsDigest: t.text().notNull(),
    /** Why the form's own `onSubmit` did not finish — see `runHandler`. */
    handlerError: t.text(),
    /**
     * What one administrator wants the next one to know — never shown to
     * the visitor, and kept beside the answers rather than in a table of
     * its own: a note has no life once the submission it annotates is
     * deleted.
     */
    note: t.text(),
    answers: t.text({ mode: "json" }).$type<FormAnswers>().notNull(),
  }),
  (table) => [
    // SQLite appends the rowid to every index, and `id` is the rowid, so
    // each of these already ends with the column the inbox pages on.
    // That is why `(form)` is not the redundant prefix of `(form,
    // status)` it looks like: it is really `(form, id)`, and without it a
    // form-filtered page has to sort that form's whole backlog in a temp
    // b-tree to return one page. `(status)` earns its keep the same way.
    // None carries `created_at` — whole seconds tie within a burst.
    index("form_submissions_form_idx").on(table.form),
    index("form_submissions_form_status_idx").on(table.form, table.status),
    index("form_submissions_status_idx").on(table.status),
    // "Every submission for this thing." Both columns are always asked
    // for together, so the planner needs the kind to lead; a query on
    // `bound_type` alone falls back to a scan. Partial, because a
    // submission that bound nothing is never looked up by it.
    index("form_submissions_bound_idx")
      .on(table.boundType, table.boundId)
      .where(sql`${table.boundId} is not null`),
  ],
);

/**
 * What each field and option was called, stored once per distinct
 * snapshot and keyed by the digest of its own content. A snapshot is
 * never updated — a different set of labels is a different digest and so
 * a different row — which is what lets many submissions share one
 * without any of them being able to rewrite another's history.
 *
 * Rows are never deleted: a snapshot lives as long as any submission
 * points at it, and the ones that outlive their submissions are a few
 * hundred bytes each.
 */
export const formLabelSnapshots = sqliteTable("form_label_snapshots", (t) => ({
  digest: t.text().primaryKey(),
  labels: t.text({ mode: "json" }).$type<FormLabelSnapshot>().notNull(),
}));

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;

/**
 * One submission with the snapshot it points at resolved — what every
 * read answers with, and what the write path hands back, because a row
 * on its own cannot say what its answers were called. The digest drops
 * out with it: it is how the repository finds a snapshot, and of no use
 * to anything already holding one.
 */
export type StoredSubmission = Omit<
  FormSubmission,
  "labelsDigest" | "boundType" | "boundId"
> & {
  readonly labels: FormLabelSnapshot;
  readonly bound: FormBound | null;
};
