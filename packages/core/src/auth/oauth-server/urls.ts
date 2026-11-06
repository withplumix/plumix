import type { AppContext } from "../../context/app-context.js";
import { withBasePath } from "../../base-path.js";

const MCP_PATH = "/_plumix/mcp";

/** Coarse presets a client asks for; consent resolves them to capabilities. */
export const MCP_SCOPES = ["read", "draft", "full"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const AUTHORIZE_PATH = "/_plumix/oauth/authorize";
export const TOKEN_PATH = "/_plumix/oauth/token";

/**
 * From the request URL the adapter rebuilt from the forwarded scheme and
 * host, so a TLS-terminating proxy can't make it `http`. Works before and
 * after `basePath` is stripped.
 */
export function mcpUrl(ctx: AppContext): URL {
  return new URL(withBasePath(MCP_PATH, ctx.config.basePath), ctx.request.url);
}

/** The request origin plus `basePath`. */
export function issuer(ctx: AppContext): string {
  return new URL(ctx.request.url).origin + ctx.config.basePath;
}
