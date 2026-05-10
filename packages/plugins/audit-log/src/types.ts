import type { AppContext } from "@plumix/core";

import type { NewAuditLogRow } from "./db/schema.js";

export interface AuditLogRow {
  readonly id: number;
  readonly occurredAt: Date;
  readonly event: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly actorId: number | null;
  readonly actorLabel: string | null;
  readonly properties: Record<string, unknown>;
}

export interface AuditLogQueryFilter {
  /** Result cap. Defaults to 50; storage adapters clamp at their own ceiling. */
  readonly limit?: number;
}

/**
 * Pluggable storage seam. Defaults to SQLite (`sqlite()`) but the
 * shape lets a deploy hot-swap to a separate database / external
 * sink (Tinybird, BigQuery, etc.) without touching the plugin's
 * write pipeline.
 */
export interface AuditLogStorage {
  readonly kind: string;
  /** Drizzle module to forward into `definePlugin({ schema })`. */
  readonly schemaModule?: Record<string, unknown>;
  /** Batch insert. The audit-log service buffers per-request and calls this once. */
  write(ctx: AppContext, rows: readonly NewAuditLogRow[]): Promise<void>;
  /** Latest-first read for the admin feed. */
  query(
    ctx: AppContext,
    filter: AuditLogQueryFilter,
  ): Promise<readonly AuditLogRow[]>;
}

export type AuditLogActor =
  | { readonly id: number; readonly label: string | null }
  | { readonly id: null; readonly label: string | null };
