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
    ipHash: t.text(),
    userAgent: t.text(),
    /** Why the form's own `onSubmit` did not finish — see `runHandler`. */
    handlerError: t.text(),
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
    // The inbox's two reads: one form newest-first, and one form's status tab.
    index("form_submissions_slug_created_idx").on(
      table.formSlug,
      table.createdAt,
    ),
    index("form_submissions_slug_status_idx").on(table.formSlug, table.status),
  ],
);

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
