// Default storage: write + query against `ctx.db` using the plugin's
// own Drizzle table definition. The `schemaModule` field is forwarded
// to `definePlugin({ schema })` so `plumix migrate generate` picks
// up the table on the next codegen run.

import { and, desc, eq, gte, like, lt, lte, or } from "drizzle-orm";

import type {
  AuditLogQueryFilter,
  AuditLogQueryResult,
  AuditLogRow,
  AuditLogStorage,
} from "../types.js";
import * as schema from "../db/schema.js";
import { auditLog } from "../db/schema.js";
import { decodeCursor, encodeCursor } from "./cursor.js";

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

    async query(
      ctx,
      filter: AuditLogQueryFilter,
    ): Promise<AuditLogQueryResult> {
      const limit = clampLimit(filter.limit);
      const conditions = buildConditions(filter);
      // Peek one row past the page so we can decide if there's a
      // nextCursor without re-querying.
      const rows = await ctx.db
        .select()
        .from(auditLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(limit + 1);

      const sliced = rows.slice(0, limit);
      const last = sliced[sliced.length - 1];
      const hasMore = rows.length > limit && last !== undefined;
      const nextCursor = hasMore
        ? encodeCursor({
            occurredAt: Math.floor(last.occurredAt.getTime() / 1000),
            id: last.id,
          })
        : null;

      return { rows: sliced.map(toAuditLogRow), nextCursor };
    },

    async purge(ctx, { cutoff }) {
      const deleted = await ctx.db
        .delete(auditLog)
        .where(lt(auditLog.occurredAt, cutoff))
        .returning({ id: auditLog.id });
      return { deleted: deleted.length };
    },
  };
}

function buildConditions(filter: AuditLogQueryFilter) {
  const out = [];

  if (filter.actorId !== undefined) {
    out.push(eq(auditLog.actorId, filter.actorId));
  }
  if (filter.subjectType !== undefined) {
    out.push(eq(auditLog.subjectType, filter.subjectType));
  }
  if (filter.subjectId !== undefined) {
    out.push(eq(auditLog.subjectId, filter.subjectId));
  }
  if (filter.eventPrefix !== undefined && filter.eventPrefix !== "") {
    // The `event` index serves this as a prefix range scan. We don't
    // ESCAPE `%`/`_` because the input is trusted: it comes from an
    // admin-only RPC (capability-gated) and the admin UI selects from
    // a fixed namespace list (`entry:`, `user:`, …). A future call
    // path that funnels untrusted input here MUST sanitize the prefix
    // before reaching this builder.
    out.push(like(auditLog.event, `${filter.eventPrefix}%`));
  }
  if (filter.occurredAfter !== undefined) {
    out.push(gte(auditLog.occurredAt, new Date(filter.occurredAfter * 1000)));
  }
  if (filter.occurredBefore !== undefined) {
    out.push(lte(auditLog.occurredAt, new Date(filter.occurredBefore * 1000)));
  }
  if (filter.cursor !== undefined && filter.cursor !== "") {
    out.push(cursorCondition(filter.cursor));
  }
  return out;
}

// Strict row-tuple comparison `(occurred_at, id) < (cursor.occurredAt, cursor.id)`
// expressed via the equivalent OR of: row's occurred_at strictly less, OR
// equal occurred_at with strictly less id. Using two predicates keeps the
// query planner happy across drivers; the `audit_log_occurred_at_idx`
// covers it.
function cursorCondition(cursor: string) {
  // CursorError propagates up to the RPC layer where it's mapped to a
  // typed error response.
  const position = decodeCursor(cursor);
  const occurredAt = new Date(position.occurredAt * 1000);
  return or(
    lt(auditLog.occurredAt, occurredAt),
    and(eq(auditLog.occurredAt, occurredAt), lt(auditLog.id, position.id)),
  );
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
