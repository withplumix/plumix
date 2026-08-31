import type { AppContext } from "plumix/plugin";
import { jsonResponse } from "plumix";

import type { ReindexStatus, SearchReindexRun } from "../db/schema.js";
import { latestReindex, startReindex } from "./reindex.js";

/** What an operator is told about a rebuild. */
interface ReindexReport {
  readonly status: ReindexStatus;
  /** Sources rebuilt so far, and sources this run could not rebuild. */
  readonly processed: number;
  readonly failed: number;
  readonly startedAt: string;
  /** Null while it is still going. */
  readonly finishedAt: string | null;
}

function report(run: SearchReindexRun): ReindexReport {
  return {
    status: run.status,
    processed: run.processed,
    failed: run.failed,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Start a rebuild, and answer with where it has got to.
 *
 * Starting is idempotent — a second POST while one is running reports that
 * one rather than beginning a rival walk over the same corpus — so this is
 * safe to retry and safe to wire to a button somebody may double-press. The
 * work itself happens on the scheduled runs that follow; this only records
 * that a rebuild is wanted.
 */
export async function handleReindexStart(ctx: AppContext): Promise<Response> {
  return jsonResponse(report(await startReindex(ctx)));
}

/** How the last rebuild went, or is going. `null` before there has been one. */
export async function handleReindexStatus(ctx: AppContext): Promise<Response> {
  const run = await latestReindex(ctx);
  return jsonResponse(run === null ? null : report(run));
}
