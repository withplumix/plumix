import type { AppContext } from "../context/app.js";
import { authenticateBearer } from "../auth/bearer.js";
import { methodNotAllowed, unauthorized } from "../runtime/http.js";
import { buildMcpToolRegistry } from "./registry.js";

/**
 * Serve the first-party MCP endpoint. Mounted ahead of the `/_plumix/` CSRF
 * gate and authenticated by bearer PAT (CSRF-immune). POST-only; the transport
 * itself would turn a GET into an SSE stream, so the method check lives here.
 *
 * The MCP SDK and the valibot→JSON-Schema converter load via dynamic import so
 * public/cold-start paths never evaluate them — only the lightweight tool
 * registry stays in the main graph.
 */
export async function handleMcpRequest(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);

  const authedCtx = await authenticateBearer(ctx);
  if (!authedCtx) return unauthorized();

  const tools = buildMcpToolRegistry(authedCtx.plugins);

  const { buildMcpServer } = await import("./server.js");
  const { WebStandardStreamableHTTPServerTransport } =
    await import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");

  const server = buildMcpServer(authedCtx, tools);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(authedCtx.request);
}
