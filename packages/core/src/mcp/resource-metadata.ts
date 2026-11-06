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
import { issuer, MCP_SCOPES, mcpUrl } from "../auth/oauth-server/urls.js";
import { narrowestPresetHolding } from "../auth/token-presets.js";
import { jsonResponse } from "../runtime/contract/http.js";

export function resourceMetadataUrl(ctx: AppContext): string {
  return getOAuthProtectedResourceMetadataUrl(mcpUrl(ctx));
}

/** RFC 9728 protected-resource metadata for `/_plumix/mcp`. */
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
