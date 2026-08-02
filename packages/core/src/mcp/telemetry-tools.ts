import * as v from "valibot";

import type { McpTool } from "./tool.js";
import { debugHistory } from "../dev/debug-bar/history.js";
import { McpToolError } from "./errors.js";

// Both tools read the dev request-history ring the debug bar already writes to
// — no new capture. The dev gate lives in `buildMcpToolRegistry`, which is the
// module's only importer, so this whole graph tree-shakes from production.

const requestsListInput = v.object({});

export const telemetryRequestsListTool: McpTool<typeof requestsListInput> = {
  name: "telemetry_requests_list",
  description:
    "List the requests the dev server recently handled, newest-first — each with request id, method, path, status, and duration (ms). Pick one and read its trace with telemetry_request_get.",
  inputSchema: requestsListInput,
  run() {
    return debugHistory.get().map((entry) => ({
      id: entry.id,
      method: entry.snapshot.context.method,
      path: entry.snapshot.context.path,
      status: entry.status,
      durationMs: entry.durationMs,
    }));
  },
};

const requestGetInput = v.object({
  id: v.pipe(
    v.string(),
    v.description("The request id from telemetry_requests_list."),
  ),
  // Records (SQL, resolved routes, cache activity) can be large, so they are
  // opt-in: spans are the default payload. `["records"]` adds them.
  include: v.optional(
    v.pipe(
      v.array(v.picklist(["records"])),
      v.description(
        'Optional record payloads to include. Omit for spans only; pass ["records"] to also return the request\'s records keyed by namespace.',
      ),
    ),
    [],
  ),
});

export const telemetryRequestGetTool: McpTool<typeof requestGetInput> = {
  name: "telemetry_request_get",
  description:
    "Read one recent request's trace by id: the context projection and the span tree (name, timing, status, captured error, attributes, nested children). Records are opt-in via `include` so a large snapshot doesn't flood context.",
  inputSchema: requestGetInput,
  run(_ctx, input) {
    const entry = debugHistory.find(input.id);
    if (entry === undefined) {
      throw McpToolError.notFound(`no captured request with id "${input.id}"`);
    }
    const { context, spans, records } = entry.snapshot;
    return input.include.includes("records")
      ? { context, spans, records }
      : { context, spans };
  },
};

/** The dev-only tracing tools, joined into the MCP registry under the dev gate. */
export const telemetryMcpTools: readonly McpTool[] = [
  telemetryRequestsListTool,
  telemetryRequestGetTool,
];
