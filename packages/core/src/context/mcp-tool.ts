import type { GenericSchema, InferOutput } from "valibot";

import type { JsonObject } from "../json.js";
import type { AppContext } from "./app-context.js";

/**
 * Not under `mcp/`: a contract there naming `AppContext` would form an import
 * cycle with the plugin registry that holds tools.
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
   * Advisory only: nothing authorizes on them.
   */
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
  };
  /**
   * A token lacking it gets 403 `insufficient_scope` before `run`, so its
   * client can ask for more. `run` still checks what depends on the input.
   */
  readonly capability?: string;
  /**
   * Not `JsonValue` though the transport stringifies it: read-service rows
   * carry `Date` fields and a `ResolvedMeta` bag still typed `Record<string,
   * unknown>`.
   */
  // eslint-disable-next-line plumix/no-unknown-return
  run(ctx: AppContext, input: InferOutput<TSchema>): unknown;
}
