import type { AppContext } from "plumix/plugin";
import { jsonResponse } from "plumix/plugin";

import type { ReindexStatus, SearchReindexRun } from "../db/schema.js";
import { latestReindex, startReindex } from "./reindex.js";

interface ReindexReport {
  readonly status: ReindexStatus;
  readonly processed: number;
  readonly failed: number;
  readonly startedAt: string;
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
 * Idempotent: a POST during a run reports it. Only records the request;
 * scheduled runs do the work.
 */
export async function handleReindexStart(ctx: AppContext): Promise<Response> {
  return jsonResponse(report(await startReindex(ctx)));
}

/** How the last rebuild went, or is going. `null` before there has been one. */
export async function handleReindexStatus(ctx: AppContext): Promise<Response> {
  const run = await latestReindex(ctx);
  return jsonResponse(run === null ? null : report(run));
}
