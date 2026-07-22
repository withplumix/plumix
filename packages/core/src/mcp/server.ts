import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as v from "valibot";

import type { AppContext } from "../context/app.js";
import type { McpTool } from "./tool.js";
import { McpToolError, toToolErrorResult } from "./errors.js";
import { toToolInputJsonSchema } from "./schema-projection.js";

const SERVER_INFO = { name: "plumix", version: "0.1.0" } as const;

/** Build a low-level MCP `Server` over a tool registry, closing over the
 *  bearer-authed `ctx` that each tool's `run` receives. */
export function buildMcpServer(
  ctx: AppContext,
  tools: ReadonlyMap<string, McpTool>,
): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [...tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toToolInputJsonSchema(tool),
      annotations: { readOnlyHint: true },
    })),
  }));

  server.setRequestHandler(
    CallToolRequestSchema,
    (request): Promise<CallToolResult> =>
      // One span per tool call — validation included, so an unknown tool or a
      // bad argument shows up as an error span attributed to the tool name.
      ctx.telemetry.span(
        `mcp: ${request.params.name}`,
        async (s): Promise<CallToolResult> => {
          s.set("mcp.tool", request.params.name);
          const tool = tools.get(request.params.name);
          if (tool === undefined) {
            throw new McpError(
              ErrorCode.MethodNotFound,
              `unknown tool: "${request.params.name}"`,
            );
          }

          const parsed = v.safeParse(
            tool.inputSchema,
            request.params.arguments ?? {},
          );
          if (!parsed.success) {
            throw new McpError(
              ErrorCode.InvalidParams,
              v.summarize(parsed.issues),
            );
          }

          try {
            const result = await tool.run(ctx, parsed.output);
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          } catch (error) {
            if (error instanceof McpToolError) return toToolErrorResult(error);
            throw error;
          }
        },
      ),
  );

  return server;
}
