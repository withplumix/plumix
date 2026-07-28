import type { AppContext } from "../context/app.js";
import { authenticateBearer } from "../auth/bearer.js";
import { forbidden, methodNotAllowed, unauthorized } from "../runtime/http.js";
import { resolveMcpDevTrust } from "./dev-trust.js";
import { buildMcpToolRegistry } from "./registry.js";

/**
 * Serve the first-party MCP endpoint. Mounted ahead of the `/_plumix/` CSRF
 * gate and authenticated by bearer PAT (CSRF-immune). POST-only; the transport
 * itself would turn a GET into an SSE stream, so the method check lives here.
 *
 * In dev over loopback the endpoint trusts the local developer with no token
 * (see {@link resolveMcpDevTrust}); production and non-loopback dev binds keep
 * the bearer-PAT requirement unchanged.
 *
 * The MCP SDK and the valibot→JSON-Schema converter load via dynamic import so
 * public/cold-start paths never evaluate them — only the lightweight tool
 * registry stays in the main graph.
 */
export async function handleMcpRequest(
  ctx: AppContext,
  devCsrfLocalhost: boolean,
): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);

  const trust = resolveMcpDevTrust(ctx, devCsrfLocalhost);
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
