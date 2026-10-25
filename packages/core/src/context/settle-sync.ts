import type { AppContext } from "./app-context.js";
import type {
  SyncAfterEvent,
  SyncSettleFailure,
  SyncSettleReport,
} from "./runtime-adapter.js";
import { sync } from "../hooks/sync.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runListeners(
  ctx: AppContext,
  event: SyncAfterEvent,
): Promise<SyncSettleFailure[]> {
  const failures = await ctx.events.emit(sync.after, event);
  return failures.map(({ plugin, error }) => ({
    step: plugin === null ? "core" : `plugin:${plugin}`,
    message: messageOf(error),
  }));
}

/**
 * Runs every `sync.after` handler, then purges the whole CDN. Each step runs
 * whatever the others did. A failure is reported, not thrown: the data it
 * follows is already replaced.
 */
export async function settleSync(
  ctx: AppContext,
  event: SyncAfterEvent,
): Promise<SyncSettleReport> {
  const failures = await runListeners(ctx, event);
  if (ctx.cdn === undefined) return { cdn: "none", failures };
  if (ctx.cdn.purgeAll === undefined) return { cdn: "cannot-purge", failures };
  try {
    await ctx.cdn.purgeAll();
  } catch (error) {
    return {
      cdn: "failed",
      failures: [...failures, { step: "cdn", message: messageOf(error) }],
    };
  }
  return { cdn: "purged", failures };
}
