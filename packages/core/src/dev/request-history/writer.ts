import type { TelemetryConsumer } from "../../context/telemetry.js";
import type { DebugHistoryStore } from "./store.js";
import { stripBasePath } from "../../base-path.js";
import { isDebugRequestsPath } from "./path.js";
import { projectDebugSnapshot } from "./snapshot.js";

/**
 * Kept in step with the literal the dispatcher owns (`MCP_PATH`); duplicated
 * rather than imported for the same tree-shaking reason as DEBUG_REQUESTS_PATH.
 */
const MCP_PATH = "/_plumix/mcp";

/**
 * Never declines via `sample`: with the bar off it may be the only consumer,
 * and a no vote deactivates the collector for the whole request.
 */
export function debugHistoryConsumer(
  history: DebugHistoryStore,
): TelemetryConsumer {
  return {
    id: "debug-history",
    onRequestEnd: (snapshot, ctx) => {
      if (isRingReader(new URL(ctx.request.url).pathname, ctx.config.basePath))
        return;
      history.save({
        id: snapshot.request.requestId,
        startedAt: snapshot.request.startedAt,
        status: snapshot.request.status,
        durationMs: snapshot.request.durationMs,
        snapshot: projectDebugSnapshot(snapshot, ctx),
      });
    },
  };
}

/**
 * The URL still carries any base-path mount; a path outside it is never ours.
 */
function isRingReader(pathname: string, basePath: string): boolean {
  const stripped = stripBasePath(pathname, basePath);
  if (stripped === null) return false;
  return isDebugRequestsPath(stripped) || stripped === MCP_PATH;
}
