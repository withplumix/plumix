import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

import type { FormAnswers, FormBound, FormLabelSnapshot } from "../types.js";
import { BOUND_TYPES, SUBMISSION_STATUSES } from "../types.js";

/**
 * `form` and `bound_id` have no foreign key: forms live in config, and a
 * submission must outlive its page. Fixed-width columns lead, since SQLite
 * spills a row's tail to overflow pages.
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
     * Both null or both set; every writer goes through `boundColumns`. An
     * integer, since every bindable entity has an integer key.
     */
    boundType: t.text({ enum: BOUND_TYPES }),
    boundId: t.integer(),
    ipHash: t.text(),
    userAgent: t.text(),
    labelsDigest: t.text().notNull(),
    /** Why the form's own `onSubmit` did not finish — see `runHandler`. */
    handlerError: t.text(),
    /** Admin-only; never shown to the visitor. */
    note: t.text(),
    answers: t.text({ mode: "json" }).$type<FormAnswers>().notNull(),
  }),
  (table) => [
    // SQLite appends the rowid (`id`) to every index, so `(form)` is really
    // `(form, id)` and not a redundant prefix: it serves the inbox's paging.
    index("form_submissions_form_idx").on(table.form),
    index("form_submissions_form_status_idx").on(table.form, table.status),
    index("form_submissions_status_idx").on(table.status),
    // Partial: a submission that bound nothing is never looked up by it.
    index("form_submissions_bound_idx")
      .on(table.boundType, table.boundId)
      .where(sql`${table.boundId} is not null`),
  ],
);

/**
 * Content-addressed and immutable, so submissions share snapshots safely.
 * Never deleted; orphans are a few hundred bytes each.
 */
export const formLabelSnapshots = sqliteTable("form_label_snapshots", (t) => ({
  digest: t.text().primaryKey(),
  labels: t.text({ mode: "json" }).$type<FormLabelSnapshot>().notNull(),
}));

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;

export type StoredSubmission = Omit<
  FormSubmission,
  "labelsDigest" | "boundType" | "boundId"
> & {
  readonly labels: FormLabelSnapshot;
  readonly bound: FormBound | null;
};
