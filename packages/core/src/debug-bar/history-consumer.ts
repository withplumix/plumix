import type { TelemetryConsumer } from "../context/telemetry.js";
import type { DebugHistoryStore } from "./history.js";
import { debugHistory } from "./history.js";
import { projectDebugSnapshot } from "./snapshot.js";

/**
 * The request-history writer: a telemetry consumer that, on request-end,
 * projects the finished snapshot ({@link projectDebugSnapshot}) and saves it to
 * the {@link DebugHistoryStore} (which serializes it to inert, bounded JSON).
 * `onRequestEnd` runs after the response via `waitUntil`, so capture adds no
 * latency — mirroring the OTLP exporter. It captures every request kind (HTML,
 * RPC, REST/`api`, 5xx) because it never inspects the response body; the store
 * is exactly where an API/RPC call — which never gets an inline bar — becomes
 * inspectable. Referenced only under the `PLUMIX_DEV` gate, so it and its
 * store tree-shake out of production.
 */
export function debugHistoryConsumer(
  history: DebugHistoryStore = debugHistory,
): TelemetryConsumer {
  return {
    id: "debug-history",
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
