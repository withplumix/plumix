// Rows buffer per request and flush as one INSERT after the response.

import type { AppContext, Logger } from "plumix/plugin";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditLogStorage } from "../types.js";

export interface AuditService {
  record(ctx: AppContext, row: NewAuditLogRow): void;
}

// Mirrors core's 256 KiB meta cap, so one subscriber-built `properties`
// envelope can't blow the SQLite column limit.
const MAX_PROPERTIES_BYTES = 256 * 1024;

type Buffers = WeakMap<AppContext["memo"], NewAuditLogRow[]>;

export function createAuditService(storage: AuditLogStorage): AuditService {
  // Keyed on the memo, not the context: core derives contexts by spreading,
  // but the memo is one object per request, carried through every derivation.
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
    // The microtask lets synchronous sibling record() calls join this buffer
    // before flush drains it. Some runtimes lack `defer`; audit must never
    // affect the response.
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
  // Detach first so a re-entrant `record` during the await gets a fresh buffer
  // and its own flush.
  const rows = buffers.get(ctx.memo);
  if (!rows || rows.length === 0) return;
  buffers.delete(ctx.memo);
  // ctx.defer already logs rejections generically; this names the audit write.
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
