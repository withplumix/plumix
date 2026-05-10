// Default storage: write + query against `ctx.db` using the plugin's
// own Drizzle table definition. The `schemaModule` field is forwarded
// to `definePlugin({ schema })` so `plumix migrate generate` picks
// up the table on the next codegen run.

import { desc } from "drizzle-orm";

import type {
  AuditLogQueryFilter,
  AuditLogRow,
  AuditLogStorage,
} from "../types.js";
import * as schema from "../db/schema.js";
import { auditLog } from "../db/schema.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export function sqlite(): AuditLogStorage {
  return {
    kind: "sqlite",
    schemaModule: schema,

    async write(ctx, rows) {
      if (rows.length === 0) return;
      // SQLite INSERT … VALUES (?, …), (?, …) — drizzle batches
      // multi-row inserts into a single statement.
      await ctx.db.insert(auditLog).values([...rows]);
    },

    async query(ctx, filter: AuditLogQueryFilter) {
      const limit = clampLimit(filter.limit);
      const rows = await ctx.db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(limit);
      return rows.map(toAuditLogRow);
    },
  };
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(requested), MAX_LIMIT);
}

function toAuditLogRow(row: typeof auditLog.$inferSelect): AuditLogRow {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    event: row.event,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    properties: row.properties,
  };
}
