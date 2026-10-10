import type { AppContext } from "../context/app-context.js";
import { authenticateBearer } from "../auth/bearer.js";
import {
  forbidden,
  methodNotAllowed,
  unauthorized,
} from "../runtime/contract/http.js";
import { resolveMcpDevTrust } from "./dev-trust.js";
import { buildMcpToolRegistry } from "./registry.js";

/** The MCP entry point, as `PlumixApp.loadMcpHandler` resolves it. */
export type McpHandler = (ctx: AppContext) => Promise<Response>;

/**
 * Mounted ahead of the CSRF gate: bearer tokens are CSRF-immune. POST-only
 * because the transport would turn a GET into an SSE stream.
 */
export async function handleMcpRequest(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);

  const trust = resolveMcpDevTrust(ctx);
  if (trust === "rejected") return forbidden("mcp_cross_origin");

  let toolCtx: AppContext;
  if (trust === "trusted") {
    toolCtx = ctx;
  } else {
    const authedCtx = await authenticateBearer(ctx);
    if (!authedCtx) return unauthorized();
    toolCtx = authedCtx;
  }

  const tools = buildMcpToolRegistry(toolCtx.plugins);

  const { buildMcpServer } = await import("./server.js");
  const { WebStandardStreamableHTTPServerTransport } =
    await import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");

  const server = buildMcpServer(toolCtx, tools);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(toolCtx.request);
}
