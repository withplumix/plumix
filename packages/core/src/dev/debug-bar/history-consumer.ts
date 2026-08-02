import type { TelemetryConsumer } from "../../context/telemetry.js";
import type { DebugHistoryStore } from "./history.js";
import { stripBasePath } from "../../base-path.js";
import { debugHistory } from "./history.js";
import { isDebugRequestsPath } from "./requests-path.js";
import { projectDebugSnapshot } from "./snapshot.js";

// The MCP endpoint is a second reader of the ring (the dev telemetry tracing
// tools), so it is excluded from capture too — otherwise every list/inspect
// call would evict a real request from the window the tools exist to expose.
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
 * exception being its own read endpoint, which `sample` votes out so listing
 * the history never pollutes it. The store is exactly where an API/RPC call —
 * which never gets an inline bar — becomes inspectable. Referenced only under
 * the `PLUMIX_DEV` gate, so it and its store tree-shake out of production.
 */
export function debugHistoryConsumer(
  history: DebugHistoryStore = debugHistory,
): TelemetryConsumer {
  return {
    id: "debug-history",
    // The `sample` vote runs at context creation, before the base-path prefix
    // is stripped, so normalize against `ctx.basePath` before matching.
    sample: (ctx) => {
      const stripped = stripBasePath(
        new URL(ctx.request.url).pathname,
        ctx.basePath,
      );
      if (stripped === null) return true;
      return !isDebugRequestsPath(stripped) && stripped !== MCP_PATH;
    },
    onRequestEnd: (snapshot, ctx) => {
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
