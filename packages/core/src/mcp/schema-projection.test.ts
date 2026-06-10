import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { McpTool } from "./tool.js";
import { toToolInputJsonSchema } from "./schema-projection.js";

function toolWith(partial: Partial<McpTool>): McpTool {
  return {
    name: "t",
    description: "d",
    inputSchema: v.object({}),
    run: () => null,
    ...partial,
  };
}

describe("toToolInputJsonSchema", () => {
  test("projects a valibot object schema to JSON Schema", () => {
    const schema = toToolInputJsonSchema(
      toolWith({
        inputSchema: v.object({
          type: v.optional(v.string()),
          limit: v.number(),
        }),
      }),
    );

    expect(schema.type).toBe("object");
    expect(schema.properties).toMatchObject({
      type: { type: "string" },
      limit: { type: "number" },
    });
    expect(schema.required).toEqual(["limit"]);
  });

  test("a hand-written jsonSchema override replaces the projection verbatim", () => {
    const override = { type: "object", properties: { q: { type: "string" } } };
    const schema = toToolInputJsonSchema(
      toolWith({
        inputSchema: v.object({ ignored: v.string() }),
        jsonSchema: override,
      }),
    );

    expect(schema).toBe(override);
  });
});
