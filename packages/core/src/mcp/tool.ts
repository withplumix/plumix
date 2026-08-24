import type { GenericSchema, InferOutput } from "valibot";

import type { AppContext } from "../context/app.js";
import type { JsonObject } from "../json.js";

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
  readonly jsonSchema?: JsonObject;
  /**
   * The tool's work. The transport `JSON.stringify`s what it hands back, so
   * `JsonValue` is the type this wants — but a tool returns a read service's
   * row, and those carry `Date` fields and a `ResolvedMeta` bag that is still
   * `Record<string, unknown>`. This becomes `JsonValue` when the meta pipeline
   * finishes the migration #1817 deferred, not before.
   */
  // eslint-disable-next-line plumix/no-unknown-return
  run(ctx: AppContext, input: InferOutput<TSchema>): unknown;
}
