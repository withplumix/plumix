import { toJsonSchema } from "@valibot/to-json-schema";

import type { McpTool } from "./tool.js";

/** Project a tool's valibot input to the JSON Schema advertised in `tools/list`,
 *  preferring a hand-written `jsonSchema` override when present. */
export function toToolInputJsonSchema(tool: McpTool): Record<string, unknown> {
  if (tool.jsonSchema !== undefined) return tool.jsonSchema;
  return toJsonSchema(tool.inputSchema, {
    errorMode: "ignore",
  }) as Record<string, unknown>;
}
