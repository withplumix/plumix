import type { TelemetryConsumer } from "../../context/telemetry.js";
import type { DebugHistoryStore } from "./store.js";
import { stripBasePath } from "../../base-path.js";
import { isDebugRequestsPath } from "./path.js";
import { projectDebugSnapshot } from "./snapshot.js";
import { debugHistory } from "./store.js";

// Kept in step with the literal the dispatcher owns (`MCP_PATH`); duplicated
// rather than imported for the same tree-shaking reason as DEBUG_REQUESTS_PATH.
const MCP_PATH = "/_plumix/mcp";

/**
 * The request-history writer: a telemetry consumer that, on request-end,
 * projects the finished snapshot ({@link projectDebugSnapshot}) and saves it to
 * the {@link DebugHistoryStore} (which serializes it to inert, bounded JSON).
 * `onRequestEnd` runs after the response via `waitUntil`, so capture adds no
 * latency — mirroring the OTLP exporter. It captures every request kind (HTML,
 * RPC, REST/`api`, 5xx) because it never inspects the response body — the one
 * exception being the two endpoints that *read* the ring, its own read routes
 * and the MCP endpoint behind the tracing tools, which it declines to save so
 * listing the history never evicts a real request from the window those tools
 * exist to expose. The store is exactly where an API/RPC call — which never
 * gets an inline bar — becomes inspectable. Referenced only under the
 * `PLUMIX_DEV` gate, so it and its store tree-shake out of production.
 *
 * Declining is a decision about saving, not about collecting. With the bar off
 * this is the only consumer a dev server is guaranteed to have, so a `sample`
 * vote of no deactivates the collector for the whole request rather than just
 * skipping the write — which on the read routes is what blanks the dev error
 * page (#1574), and on either path leaves anything else reading `ctx.telemetry`
 * mid-request, a plugin's MCP tool included, looking at a no-op (#2369).
 */
export function debugHistoryConsumer(
  history: DebugHistoryStore = debugHistory,
): TelemetryConsumer {
  return {
    id: "debug-history",
    onRequestEnd: (snapshot, ctx) => {
      if (isRingReader(new URL(ctx.request.url).pathname, ctx.basePath)) return;
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

/** The request URL still carries any base-path mount, so strip it before
 *  matching; a path outside the mount is never one of ours. */
function isRingReader(pathname: string, basePath: string): boolean {
  const stripped = stripBasePath(pathname, basePath);
  if (stripped === null) return false;
  return isDebugRequestsPath(stripped) || stripped === MCP_PATH;
}
