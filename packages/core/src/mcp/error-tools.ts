import * as v from "valibot";

import type {
  TelemetrySpan,
  TelemetrySpanError,
} from "../context/telemetry.js";
import type { McpTool } from "./tool.js";
import { debugHistory } from "../debug-bar/history.js";

// The server half of the dev-only error surface. Projects failed requests out
// of the same request-history ring the tracing tools read — no new capture. The
// dev gate lives in `buildMcpToolRegistry`, this module's only importer, so the
// whole graph tree-shakes from production. The client half (browser errors from
// the terminal forwarder) merges into this same list in a later slice.

/** One server failure as a connected agent reads it: what broke, and the id to
 *  pivot into `telemetry_request_get` for what led to it. */
interface ServerErrorEntry {
  readonly source: "server";
  readonly level: "error";
  readonly message: string;
  readonly stack?: string;
  readonly path: string;
  /** When the failing request began (epoch ms). */
  readonly timestamp: number;
  /** The originating request id — resolves in `telemetry_request_get`. */
  readonly requestId: string;
}

/**
 * The error that ended a failed request. An uncaught throw propagates up to the
 * outermost span, and the collector captures the same `{name, message, stack}`
 * on every span it unwinds through — so the shallowest errored span carries the
 * failure that produced the 5xx, while a *deeper* errored span may be an
 * unrelated error caught below it. Search shallowest-first so a recovered inner
 * error never masquerades as the cause.
 */
function fatalError(
  spans: readonly TelemetrySpan[],
): TelemetrySpanError | undefined {
  for (const span of spans) {
    if (span.status === "error" && span.error) return span.error;
  }
  for (const span of spans) {
    const deeper = fatalError(span.children);
    if (deeper) return deeper;
  }
  return undefined;
}

const errorListInput = v.object({});

export const errorListTool: McpTool<typeof errorListInput> = {
  name: "error_list",
  description:
    "List the server-side failures (5xx responses) the dev server recently produced, newest-first — each with source, level, message, stack, request path, timestamp, and the originating request id. Pivot a server entry into telemetry_request_get by its requestId to see the full trace that led to it.",
  inputSchema: errorListInput,
  run() {
    // `debugHistory.get()` is already newest-first; keep the 5xx responses and
    // read the error that ended each off its span tree.
    return debugHistory
      .get()
      .filter((entry) => entry.status >= 500)
      .map((entry) => {
        const error = fatalError(entry.snapshot.spans);
        return {
          source: "server",
          level: "error",
          message: error?.message ?? `HTTP ${entry.status}`,
          stack: error?.stack,
          path: entry.snapshot.context.path,
          timestamp: entry.startedAt,
          requestId: entry.id,
        } satisfies ServerErrorEntry;
      });
  },
};

/** The dev-only error tools, joined into the MCP registry under the dev gate. */
export const errorMcpTools: readonly McpTool[] = [errorListTool];
