import { sql } from "drizzle-orm";
import { index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { FormAnswers, FormLabelSnapshot } from "../types.js";
import { SUBMISSION_STATUSES } from "../types.js";

/**
 * One answered form. `form_slug` carries no foreign key on purpose — a
 * form declared in config is a value in the repository, with no row to
 * reference — which is also why `labels` snapshots what each field and
 * option was called: it is the whole of what makes the row readable after
 * the form changes. `serial` is the per-form number a person can quote;
 * its unique index is what allocates it (see `insertSubmission`).
 * `ip_hash` is a salted SHA-256, never a cleartext address.
 */
export const formSubmissions = sqliteTable(
  "form_submissions",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    formSlug: t.text().notNull(),
    serial: t.integer().notNull(),
    status: t.text({ enum: SUBMISSION_STATUSES }).notNull().default("new"),
    answers: t.text({ mode: "json" }).$type<FormAnswers>().notNull(),
    labels: t
      .text({ mode: "json" })
      .$type<FormLabelSnapshot>()
      .notNull()
      .default({}),
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
    /** Why the form's own `onSubmit` did not finish — see `runHandler`. */
    handlerError: t.text(),
    /**
     * What one administrator wants the next one to know — never shown to
     * the visitor, and kept beside the answers rather than in a table of
     * its own: a note has no life once the submission it annotates is
     * deleted.
     */
    note: t.text(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => sql`(unixepoch())`),
  }),
  (table) => [
    // The serial guard: the allocation reads the current maximum and lets
    // this index reject the loser of a race.
    uniqueIndex("form_submissions_slug_serial_idx").on(
      table.formSlug,
      table.serial,
    ),
    // The inbox's reads, and `id` rather than `created_at` because that is
    // what orders the list and carries its cursor — a submission is never
    // rewritten, so id order is arrival order with no same-second tie to
    // break (see `listSubmissions`). Both filters are optional and either
    // can stand alone, so each leads an index of its own.
    index("form_submissions_slug_id_idx").on(table.formSlug, table.id),
    index("form_submissions_status_id_idx").on(table.status, table.id),
    // The counts beside each status, within one form.
    index("form_submissions_slug_status_idx").on(table.formSlug, table.status),
    // "Every submission for this entry", across whichever forms bound it.
    index("form_submissions_entry_idx").on(table.entryId),
  ],
);

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
