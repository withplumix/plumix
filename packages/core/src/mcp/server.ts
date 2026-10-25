import type {
  CallToolResult,
  StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import * as v from "valibot";

import type { AppContext } from "../context/app-context.js";
import type { McpTool } from "../context/mcp-tool.js";
import corePackage from "../../package.json" with { type: "json" };
import { McpToolError, toToolErrorResult } from "./errors.js";
import { toToolInputJsonSchema } from "./schema-projection.js";

const SERVER_INFO = { name: "plumix", version: corePackage.version } as const;

const READ_ONLY = { readOnlyHint: true } as const;

export function buildMcpServer(
  ctx: AppContext,
  tools: ReadonlyMap<string, McpTool>,
): McpServer {
  const server = new McpServer(SERVER_INFO);

  for (const tool of tools.values()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolInput(tool),
        annotations: tool.annotations ?? READ_ONLY,
      },
      (input): Promise<CallToolResult> =>
        // The SDK refuses an unknown tool or a bad input before this runs, so
        // neither opens a span.
        ctx.telemetry.span(
          `mcp: ${tool.name}`,
          async (s): Promise<CallToolResult> => {
            s.set("mcp.tool", tool.name);
            try {
              const result = await tool.run(ctx, input);
              return {
                content: [{ type: "text", text: JSON.stringify(result) }],
              };
            } catch (error) {
              if (error instanceof McpToolError) {
                return toToolErrorResult(error);
              }
              throw error;
            }
          },
        ),
    );
  }

  return server;
}

/** The `bad_input` prefix gives a refusal the code an `McpToolError` would. */
function toolInput(tool: McpTool): StandardSchemaWithJSON {
  const jsonSchema = () => toToolInputJsonSchema(tool);
  return {
    "~standard": {
      version: 1,
      vendor: "plumix",
      validate: (value) => {
        const parsed = v.safeParse(tool.inputSchema, value);
        if (parsed.success) return { value: parsed.output };
        return {
          issues: [{ message: `bad_input: ${v.summarize(parsed.issues)}` }],
        };
      },
      jsonSchema: { input: jsonSchema, output: jsonSchema },
    },
  };
}
