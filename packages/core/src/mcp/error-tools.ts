import * as v from "valibot";

import type { AppContext } from "../context/app-context.js";
import type { McpTool } from "../context/mcp-tool.js";
import type {
  TelemetrySpan,
  TelemetrySpanError,
} from "../context/telemetry.js";
import type { DevErrorFrame } from "../dev/ui/index.js";
import { DEV_ERROR_CLIENT_ERRORS_ENDPOINT } from "../dev/ui/index.js";

// The dev gate lives in `buildMcpToolRegistry`, this module's only importer,
// so the graph tree-shakes from production.

interface ServerErrorEntry {
  readonly source: "server";
  readonly level: "error";
  readonly message: string;
  readonly stack?: string;
  readonly path: string;
  readonly timestamp: number;
  // Resolves in `telemetry_request_get`.
  readonly requestId: string;
}

// A client error has no server request behind it, so `label` names its
// component or island instead of a request id.
interface ClientErrorEntry {
  readonly source: "client";
  readonly level: string;
  readonly message: string;
  // Already sourcemapped on the Vite/Node side.
  readonly stack: readonly DevErrorFrame[];
  readonly label?: string;
}

type ErrorEntry = ServerErrorEntry | ClientErrorEntry;

// The collector records an uncaught throw on every span it unwinds, so the
// shallowest errored span is the cause; a deeper one may be caught and
// unrelated.
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
    return [...(await clientErrors(ctx)), ...serverErrors(ctx)];
  },
};

function serverErrors(ctx: AppContext): ServerErrorEntry[] {
  return (ctx.dev?.history.get() ?? [])
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

// Client errors are captured on the Vite/Node side and read back over the dev
// origin. Any failure degrades to an empty list, never sinking the server
// errors.
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

// Cross-process JSON, so only contract fields are picked, which also keeps a
// server-only request id off a client entry.
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

/**
 * The dev-only error tools, joined into the MCP registry under the dev gate.
 */
export const errorMcpTools: readonly McpTool[] = [errorListTool];
