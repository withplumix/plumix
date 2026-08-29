import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

import type { FormAnswers, FormLabelSnapshot } from "../types.js";
import { SUBMISSION_STATUSES } from "../types.js";

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
     * The entry the form was bound to — a real column rather than a key
     * buried in `answers`, so "every submission for this entry" is a
     * query on an index rather than a scan that has to parse JSON. Null
     * for a form that binds nothing, and for a bound form rendered
     * somewhere with no entry to bind.
     */
    entryId: t.integer(),
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
    // The inbox pages on `id` descending and carries an `id` cursor, so
    // each of these is already in page order: `id` is the rowid, which
    // every index ends with. None of them carries `created_at` — it is
    // whole seconds, so it ties within a burst and cannot order a page.
    index("form_submissions_form_idx").on(table.form),
    // Not redundant with the one above: that one cannot walk a single
    // status without widening, and this one cannot order one form's rows
    // across statuses.
    index("form_submissions_form_status_idx").on(table.form, table.status),
    index("form_submissions_status_idx").on(table.status),
    // "Every submission for this entry", across whichever forms bound it.
    index("form_submissions_entry_idx").on(table.entryId),
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
export type StoredSubmission = Omit<FormSubmission, "labelsDigest"> & {
  readonly labels: FormLabelSnapshot;
};
