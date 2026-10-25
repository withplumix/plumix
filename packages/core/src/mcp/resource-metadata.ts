import type {
  AuthInfo,
  OAuthProtectedResourceMetadata,
  ScopeChallengeHandler,
} from "@modelcontextprotocol/server";
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
} from "@modelcontextprotocol/server";

import type { AppContext } from "../context/app-context.js";
import { narrowestPresetHolding } from "../auth/token-presets.js";
import { withBasePath } from "../base-path.js";
import { jsonResponse } from "../runtime/contract/http.js";

const MCP_PATH = "/_plumix/mcp";

/** Coarse presets a client asks for; consent resolves them to capabilities. */
const MCP_SCOPES = ["read", "draft", "full"] as const;

/**
 * From the request URL the adapter rebuilt from the forwarded scheme and
 * host, so a TLS-terminating proxy can't make it `http`. Works before and
 * after `basePath` is stripped.
 */
export function mcpUrl(ctx: AppContext): URL {
  return new URL(withBasePath(MCP_PATH, ctx.config.basePath), ctx.request.url);
}

export function resourceMetadataUrl(ctx: AppContext): string {
  return getOAuthProtectedResourceMetadataUrl(mcpUrl(ctx));
}

/** The request origin plus `basePath`. */
function issuer(ctx: AppContext): string {
  return new URL(ctx.request.url).origin + ctx.config.basePath;
}

/**
 * RFC 9728 protected-resource metadata for `/_plumix/mcp`. Not the SDK's
 * builder: it takes the whole authorization-server document, and core serves
 * no authorization endpoints yet.
 */
export function handleProtectedResourceMetadata(ctx: AppContext): Response {
  const metadata: OAuthProtectedResourceMetadata = {
    resource: mcpUrl(ctx).href,
    authorization_servers: [issuer(ctx)],
    scopes_supported: [...MCP_SCOPES],
  };
  return jsonResponse(metadata);
}

/**
 * Asks for every scope: consent offers what was asked for and lets the person
 * narrow it, so asking for less would hide the wider presets.
 */
export function unauthorizedChallenge(ctx: AppContext): Response {
  return bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InvalidToken, "Missing or invalid token"),
    {
      requiredScopes: [...MCP_SCOPES],
      resourceMetadataUrl: resourceMetadataUrl(ctx),
    },
  );
}

/**
 * The scope challenges read only that a token authenticated and where its
 * metadata lives; the other fields are required and left blank.
 */
export function tokenAuthInfo(ctx: AppContext): AuthInfo {
  return {
    token: "",
    clientId: "",
    scopes: [],
    resourceMetadataUrl: resourceMetadataUrl(ctx),
  };
}

const SCOPE_OF_PRESET = {
  read_only: "read",
  draft_only: "draft",
} as const;

/** A request with no token, under dev trust, is left to the tool. */
export function capabilityChallenge(
  ctx: AppContext,
  capability: string,
): ScopeChallengeHandler {
  return ({ authInfo }) => {
    if (authInfo === undefined || ctx.auth.can(capability)) return undefined;
    const preset = narrowestPresetHolding(capability);
    return { scopes: [preset === null ? "full" : SCOPE_OF_PRESET[preset]] };
  };
}
