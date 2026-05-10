import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

/**
 * Activity-log row. Denormalized by design — every label that the
 * admin feed needs to render lives in the row itself, so the source
 * entity can be hard-deleted without losing the history. The audit
 * log is a time machine; resolving a stale id at read time would
 * defeat the purpose.
 *
 * Columns:
 * - `event`         dotted action name (`entry:published`, `user:invited`, …)
 * - `subject_*`     the thing acted on; `subject_label` is the
 *                   human-friendly snapshot (entry title, user email).
 * - `actor_*`       who did it; `actor_id` is `null` for system / cron /
 *                   anonymous actions.
 * - `properties`    free-form JSON — currently `{ diff: { field: [old, new] } }`
 *                   for entry mutations; future events may add their own keys.
 */
export const auditLog = sqliteTable(
  "audit_log",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    occurredAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    event: t.text().notNull(),
    subjectType: t.text().notNull(),
    subjectId: t.text().notNull(),
    subjectLabel: t.text().notNull(),
    actorId: t.integer(),
    actorLabel: t.text(),
    properties: t
      .text({ mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  }),
  (table) => [
    // Default chronological feed.
    index("audit_log_occurred_at_idx").on(table.occurredAt),
    // "Show me everything that happened to entry 42" / term 7 / user 3.
    index("audit_log_subject_idx").on(
      table.subjectType,
      table.subjectId,
      table.occurredAt,
    ),
    // "Who did what" filter — actor profile pages, audit reports.
    index("audit_log_actor_idx").on(table.actorId, table.occurredAt),
    // Event-specific drilldown ("show me every `entry:trashed`").
    index("audit_log_event_idx").on(table.event, table.occurredAt),
  ],
);

export type NewAuditLogRow = typeof auditLog.$inferInsert;
