import type { AppContext } from "../context/app.js";
import { apiTokenAuthenticator } from "../auth/authenticator.js";
import { withUser } from "../context/app.js";
import { jsonResponse, methodNotAllowed } from "../runtime/http.js";
import { buildMcpToolRegistry } from "./registry.js";

export const MCP_PATH = "/_plumix/mcp";

// Bearer PAT only — NOT the request's configured authenticator (which defaults
// to a cookie+bearer chain, or an operator's custom guard). Cookie/session auth
// must not reach this endpoint: it's mounted ahead of the CSRF gate, and only
// bearer auth is inherently CSRF-immune.
const bearerAuthenticator = apiTokenAuthenticator();

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

  const result = await bearerAuthenticator.authenticate(ctx.request, ctx.db);
  if (!result) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  const { id, email, role, meta } = result.user;
  const authedCtx = withUser(
    ctx,
    { id, email, role, meta },
    result.tokenScopes ?? null,
  );
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
