import * as v from "valibot";

import type { AppContext } from "../context/app.js";
import type {
  TelemetrySpan,
  TelemetrySpanError,
} from "../context/telemetry.js";
import type { DevErrorFrame } from "../dev/ui/index.js";
import type { McpTool } from "./tool.js";
import { debugHistory } from "../dev/debug-bar/history.js";
import { DEV_ERROR_CLIENT_ERRORS_ENDPOINT } from "../dev/ui/index.js";

// The dev-only error surface: server 5xx failures (projected from the same
// request-history ring the tracing tools read — no new capture) merged with
// client/browser failures (fetched from the dev read endpoint; see
// `clientErrors`). The dev gate lives in `buildMcpToolRegistry`, this module's
// only importer, so the whole graph tree-shakes from production.

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

/** One browser failure as a connected agent reads it — fetched from the dev
 *  client-error read endpoint (#1656) and merged into the same stream. A client
 *  error has no server request behind it, so it carries no request id: an
 *  uncaught exception, unhandled rejection, island, or hydration error names its
 *  component/island in `label` rather than a request path. */
interface ClientErrorEntry {
  readonly source: "client";
  readonly level: string;
  readonly message: string;
  /** Already sourcemapped to original-source frames on the Vite/Node side. */
  readonly stack: readonly DevErrorFrame[];
  /** The island/component the failure named (a hydration error's component). */
  readonly label?: string;
}

type ErrorEntry = ServerErrorEntry | ClientErrorEntry;

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
    "List the failures the dev server recently produced. Browser failures forwarded from the dev client — uncaught exceptions, unhandled rejections, island and hydration errors (source=client, with the offending component/island label and no request id) — lead, ahead of server 5xx responses (source=server, with request path, timestamp, and the originating request id); each run is newest-first. Every entry carries source, level, message, and stack. Pivot a server entry into telemetry_request_get by its requestId to see the full trace that led to it.",
  inputSchema: errorListInput,
  async run(ctx): Promise<ErrorEntry[]> {
    // Client entries carry no timestamp (no request behind them), so the two
    // newest-first runs are concatenated — client first — not interleaved.
    return [...(await clientErrors(ctx)), ...serverErrors()];
  },
};

/** Project the 5xx responses in the request-history ring into server entries.
 *  `debugHistory.get()` is already newest-first. */
function serverErrors(): ServerErrorEntry[] {
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
}

/**
 * Fetch the retained, already-sourcemapped client failures from the dev read
 * endpoint (#1656) — the cross-process bridge: client errors are captured and
 * sourcemapped on the Vite/Node side, and the worker reads them back over its own
 * dev origin (derived from the inbound request). Degrades to an empty list on any
 * failure — the endpoint being unreachable must never sink the server errors the
 * tool always produces locally.
 */
async function clientErrors(ctx: AppContext): Promise<ClientErrorEntry[]> {
  try {
    const url = new URL(DEV_ERROR_CLIENT_ERRORS_ENDPOINT, ctx.request.url);
    const res = await ctx.fetch(url);
    if (!res.ok) return [];
    const body = (await res.json()) as { readonly errors?: unknown };
    if (!Array.isArray(body.errors)) return [];
    return body.errors
      .map(toClientEntry)
      .filter((entry): entry is ClientErrorEntry => entry !== null);
  } catch {
    return [];
  }
}

// Project one endpoint row into the merge shape. The read endpoint is first-party
// and same-machine, but it is still cross-process JSON, so pick only the contract
// fields — which also guarantees no server-only field (a request id) leaks onto a
// client entry — and drop a row missing the essentials.
function toClientEntry(value: unknown): ClientErrorEntry | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.message !== "string" || typeof row.level !== "string") {
    return null;
  }
  return {
    source: "client",
    level: row.level,
    message: row.message,
    stack: Array.isArray(row.stack)
      ? (row.stack as readonly DevErrorFrame[])
      : [],
    ...(typeof row.label === "string" ? { label: row.label } : {}),
  };
}

/** The dev-only error tools, joined into the MCP registry under the dev gate. */
export const errorMcpTools: readonly McpTool[] = [errorListTool];
