import type { GenericSchema, InferOutput } from "valibot";

import type { AppContext } from "../context/app.js";

/**
 * One MCP tool: a name, a description, a valibot input schema authored once
 * (projected to JSON Schema for `tools/list`, validated on `tools/call`), and
 * a `run` that delegates to a service. Mirrors how `PluginRpcRouter` describes
 * an RPC surface — the registry is the seam, `run` is the adapter.
 */
export interface McpTool<TSchema extends GenericSchema = GenericSchema> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: TSchema;
  /**
   * Hand-written JSON Schema override for inputs the valibot converter can't
   * render faithfully. When set, it replaces the projected schema verbatim.
   */
  readonly jsonSchema?: Record<string, unknown>;
  run(ctx: AppContext, input: InferOutput<TSchema>): unknown;
}
