import type { AppContext, SchemaModule } from "plumix/plugin";

import type { NewAuditLogRow } from "./db/schema.js";

/**
 * An entity row as the audit pipeline reads it. Not JSON: the values are
 * entity columns, so a `Date` reaches the diff live — `shallowEqual` compares
 * them by `getTime()`.
 */
export type AuditEntityRow = Record<string, unknown>;

/**
 * The stored `properties` envelope: a diff over two {@link AuditEntityRow}s
 * plus whatever the event merged in. Not JSON on the way in, for the reason
 * given there — `auditService` runs `JSON.stringify` over it, which coerces a
 * `Date` to a string rather than refusing it. It reads back parsed.
 */
export type AuditProperties = Record<string, unknown>;

export interface AuditLogRow {
  readonly id: number;
  readonly occurredAt: Date;
  readonly event: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly actorId: number | null;
  readonly actorLabel: string | null;
  readonly properties: AuditProperties;
}

export interface AuditLogQueryFilter {
  /** Result cap. Defaults to 50; storage adapters clamp at their own ceiling. */
  readonly limit?: number;
  /** Restrict to rows whose `actor_id` matches. */
  readonly actorId?: number;
  /** Restrict to a subject kind (`entry`, `user`, …). */
  readonly subjectType?: string;
  /** Restrict to a single subject row (usually combined with `subjectType`). */
  readonly subjectId?: string;
  /** Indexed prefix range scan over `event` — `entry:`, `user:`, etc. */
  readonly eventPrefix?: string;
  /** Inclusive lower bound, epoch seconds. */
  readonly occurredAfter?: number;
  /** Inclusive upper bound, epoch seconds. */
  readonly occurredBefore?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  readonly cursor?: string;
}

export interface AuditLogQueryResult {
  readonly rows: readonly AuditLogRow[];
  /** Opaque cursor for the next page; `null` when the current page is the last. */
  readonly nextCursor: string | null;
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
  readonly schemaModule?: SchemaModule;
  /** Batch insert. The audit-log service buffers per-request and calls this once. */
  write(ctx: AppContext, rows: readonly NewAuditLogRow[]): Promise<void>;
  /** Latest-first read for the admin feed; honors filter + cursor pagination. */
  query(
    ctx: AppContext,
    filter: AuditLogQueryFilter,
  ): Promise<AuditLogQueryResult>;
  /**
   * Delete rows older than `cutoff`. Optional — adapters that can't
   * express this (e.g. append-only analytics sinks) omit it and the
   * retention runner short-circuits with a warning.
   */
  purge?(
    ctx: AppContext,
    args: { readonly cutoff: Date },
  ): Promise<{ readonly deleted: number }>;
}

export type AuditLogActor =
  | { readonly id: number; readonly label: string | null }
  | { readonly id: null; readonly label: string | null };
