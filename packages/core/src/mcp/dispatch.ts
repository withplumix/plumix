import type { AppContext } from "../context/app-context.js";
import { authenticateBearer } from "../auth/bearer.js";
import { withBasePath } from "../base-path.js";
import { loadOnce } from "../load-once.js";
import {
  forbidden,
  methodNotAllowed,
  unauthorized,
} from "../runtime/contract/http.js";
import { resolveMcpDevTrust } from "./dev-trust.js";
import { buildMcpToolRegistry } from "./registry.js";

const MCP_PATH = "/_plumix/mcp";

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
  if (trust === "trusted") {
    toolCtx = ctx;
  } else {
    const authedCtx = await authenticateBearer(ctx, mcpUrl(ctx));
    if (!authedCtx) return unauthorized();
    toolCtx = authedCtx;
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
    return createMcpHandler(newServer).fetch(toolCtx.request);
  }

  // The SDK's own legacy serving answers over SSE; the stateless JSON
  // transport is what pre-2026-07-28 clients get.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await newServer().connect(transport);
  return transport.handleRequest(toolCtx.request);
}

/**
 * The audience a token bound to this endpoint names. The dispatcher has already
 * stripped `basePath` from the request, so it goes back on.
 */
function mcpUrl(ctx: AppContext): string {
  return new URL(withBasePath(MCP_PATH, ctx.config.basePath), ctx.request.url)
    .href;
}
