import { toJsonSchema } from "@valibot/to-json-schema";

import type { JsonObject } from "../json.js";
import type { McpTool } from "./tool.js";

/** Project a tool's valibot input to the JSON Schema advertised in `tools/list`,
 *  preferring a hand-written `jsonSchema` override when present. */
export function toToolInputJsonSchema(tool: McpTool): JsonObject {
  if (tool.jsonSchema !== undefined) return tool.jsonSchema;
  return toJsonSchema(tool.inputSchema, {
    errorMode: "ignore",
  }) as JsonObject;
}
