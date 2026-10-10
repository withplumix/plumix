import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

import type { AuditProperties } from "../types.js";

/**
 * Denormalized so the source entity can be hard-deleted without losing history.
 *
 * Not JSON: the diff holds live `Date` values, which `JSON.stringify` coerces
 * to strings rather than refusing.
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
      .$type<AuditProperties>()
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
