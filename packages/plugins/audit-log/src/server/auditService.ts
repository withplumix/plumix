// Per-request batched-write service for the audit log. Hook listeners
// call `service.record(ctx, row)`; the first call schedules a single
// `ctx.defer(flush)` and subsequent calls in the same request append
// to the same WeakMap-keyed buffer. One INSERT runs after the response
// — six entry events from a single update RPC become one audit write.

import type { AppContext, Logger } from "plumix/plugin";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditLogStorage } from "../types.js";

export interface AuditService {
  record(ctx: AppContext, row: NewAuditLogRow): void;
}

// Single-row JSON cap before the audit row is dropped. Mirrors the
// 256 KiB cap in core's meta pipeline. A misbehaving subscriber can
// build an arbitrarily-large `properties` envelope; this prevents
// one row from blowing the SQLite column limit while still letting
// large-but-reasonable diffs through.
const MAX_PROPERTIES_BYTES = 256 * 1024;

type Buffers = WeakMap<AppContext["memo"], NewAuditLogRow[]>;

export function createAuditService(storage: AuditLogStorage): AuditService {
  // Per-request buffer, so an isolated request can never flush another
  // request's rows. Keyed on the request's memo rather than the context:
  // core derives contexts by spreading, and an action's context and the
  // one `ctx.audit.log()` reads can be different objects in one request.
  // The memo is one object per request, carried through every derivation.
  const buffers: Buffers = new WeakMap();

  function record(ctx: AppContext, row: NewAuditLogRow): void {
    if (!fitsSizeCap(ctx.logger, row)) return;
    const existing = buffers.get(ctx.memo);
    if (existing) {
      existing.push(row);
      return;
    }
    const buffer: NewAuditLogRow[] = [row];
    buffers.set(ctx.memo, buffer);
    // First record for this request — schedule the flush. Wrapping
    // in `Promise.resolve().then(...)` defers the buffer drain into
    // a microtask so synchronous record() siblings (one RPC handler
    // producing 2-3 events in a row) land in the same buffer before
    // flush runs. Without the wrap, an `async` flush would execute
    // synchronously up to its first await and steal the buffer.
    //
    // The outer try/catch covers the rare runtime that hasn't wired
    // `defer` (it'd throw at the call); audit writes are
    // observability and must never affect user-perceived response.
    try {
      ctx.defer(Promise.resolve().then(() => flush(buffers, storage, ctx)));
    } catch (error) {
      ctx.logger.warn(
        `[plumix/plugin-audit-log] failed to schedule flush: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { error },
      );
    }
  }

  return { record };
}

async function flush(
  buffers: Buffers,
  storage: AuditLogStorage,
  ctx: AppContext,
): Promise<void> {
  // Detach the buffer from the map first. A re-entrant `record`
  // during the upcoming `await` lands in a fresh buffer with its own
  // scheduled flush — it can't append to the rows we're about to
  // write, and we can't lose its row.
  const rows = buffers.get(ctx.memo);
  if (!rows || rows.length === 0) return;
  buffers.delete(ctx.memo);
  // Audit-write failures never bubble to the caller. ctx.defer's own
  // catch logs through ctx.logger.error already; we add a warn-level
  // breadcrumb so operators see the audit-write specifically (vs a
  // generic "deferred promise rejected").
  try {
    await storage.write(ctx, rows);
  } catch (error) {
    ctx.logger.warn(
      `[plumix/plugin-audit-log] storage.write failed (${String(rows.length)} rows dropped): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { error },
    );
  }
}

function fitsSizeCap(logger: Logger, row: NewAuditLogRow): boolean {
  // JSON.stringify on the `properties` column. Drop the row + warn
  // when over-cap so the SQLite column doesn't accept a payload that
  // a misbehaving subscriber assembled. Empty / small `properties`
  // is the common case and short-circuits cheaply.
  let serialized: string;
  try {
    serialized = JSON.stringify(row.properties ?? {});
  } catch (error) {
    logger.warn(
      `[plumix/plugin-audit-log] properties not JSON-serializable: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { event: row.event, error },
    );
    return false;
  }
  if (serialized.length <= MAX_PROPERTIES_BYTES) return true;
  logger.warn(
    `[plumix/plugin-audit-log] properties exceeds ${String(MAX_PROPERTIES_BYTES)} bytes (${String(serialized.length)}); row dropped`,
    { event: row.event, subjectId: row.subjectId },
  );
  return false;
}
