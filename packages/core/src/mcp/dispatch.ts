import type { AuthInfo } from "@modelcontextprotocol/server";

import type { AppContext } from "../context/app-context.js";
import { audienceTokenAuthenticator } from "../auth/authenticator.js";
import { authenticateBearer } from "../auth/bearer.js";
import { mcpUrl } from "../auth/oauth-server/urls.js";
import { loadOnce } from "../load-once.js";
import { forbidden, methodNotAllowed } from "../runtime/contract/http.js";
import { asLoopbackAdmin } from "./dev-loopback.js";
import { resolveMcpDevTrust } from "./dev-trust.js";
import { buildMcpToolRegistry } from "./registry.js";

const loadResourceMetadata = loadOnce(() => import("./resource-metadata.js"));

const loadMcpServer = loadOnce(() => import("./server.js"));

const loadMcpSdk = loadOnce(() => import("@modelcontextprotocol/server"));

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
  let authInfo: AuthInfo | undefined;
  if (process.env.PLUMIX_DEV && trust === "trusted") {
    toolCtx = await asLoopbackAdmin(ctx);
  } else {
    const { tokenAuthInfo, unauthorizedChallenge } =
      await loadResourceMetadata();
    const audience = mcpUrl(ctx).href;
    const authedCtx = await authenticateBearer(ctx, audience);
    if (!authedCtx) return unauthorizedChallenge(ctx);
    // A tool's RPC call resolves the caller again, so it must accept the
    // audience-bound token this endpoint did.
    toolCtx = {
      ...authedCtx,
      authenticator: audienceTokenAuthenticator(audience),
    };
    authInfo = tokenAuthInfo(authedCtx);
  }

  const tools = buildMcpToolRegistry(toolCtx.plugins);

  const { buildMcpServer } = await loadMcpServer();
  const {
    createMcpHandler,
    isLegacyRequest,
    WebStandardStreamableHTTPServerTransport,
  } = await loadMcpSdk();

  const newServer = () => buildMcpServer(toolCtx, tools);
  if (!(await isLegacyRequest(toolCtx.request))) {
    return createMcpHandler(newServer).fetch(toolCtx.request, { authInfo });
  }

  // The SDK's own legacy serving answers over SSE; the stateless JSON
  // transport is what pre-2026-07-28 clients get.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await newServer().connect(transport);
  return transport.handleRequest(toolCtx.request, { authInfo });
}
