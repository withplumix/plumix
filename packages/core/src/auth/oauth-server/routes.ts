import * as v from "valibot";

import type { AppContext } from "../../context/app-context.js";
import type { ApprovedAccess } from "./grants.js";
import { withBasePath } from "../../base-path.js";
import { now } from "../../clock.js";
import { encodeBase64url } from "../../encoding.js";
import {
  jsonResponse,
  methodNotAllowed,
  redirectTo,
} from "../../runtime/contract/http.js";
import { createApiToken } from "../api-tokens.js";
import { authenticateSession } from "../authenticator.js";
import {
  authorizationParamsSchema,
  authorizationResponseUrl,
  resolveClient,
  validateAuthorizationRequest,
} from "./authorization-request.js";
import { ClientMetadataError } from "./client-metadata.js";
import {
  checkOAuthGrant,
  consumeAuthorizationCode,
  findOAuthGrant,
  findRefreshableAccess,
  issueAuthorizationCode,
  issueRefreshToken,
  spendRefreshToken,
} from "./grants.js";

export { handleAuthorizationServerMetadata } from "./metadata.js";

/**
 * Must match the admin router's `/auth/authorize` page.
 * Guarded by: packages/core/src/auth/oauth-server/routes.test.ts
 */
const CONSENT_PATH = "/_plumix/admin/auth/authorize";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export async function handleAuthorize(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  const url = new URL(ctx.request.url);
  const parsed = v.safeParse(
    authorizationParamsSchema,
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) return oauthError("invalid_request");
  const validated = await validateAuthorizationRequest(ctx, parsed.output);
  if (!validated.ok) {
    const { refusal } = validated;
    return refusal.redirect
      ? redirectTo(
          authorizationResponseUrl(ctx, refusal, { error: refusal.error }),
        )
      : oauthError(refusal.error);
  }

  const { request } = validated;
  const session = await authenticateSession(ctx);
  if (session !== null) {
    const { requested, covered } = await checkOAuthGrant(
      ctx.db,
      ctx.plugins,
      session.user,
      request,
    );
    if (covered) {
      const code = await issueAuthorizationCode(ctx.db, {
        userId: session.user.id,
        request,
        scopes: requested,
      });
      return redirectTo(authorizationResponseUrl(ctx, request, { code }));
    }
  }

  const consent = new URL(withBasePath(CONSENT_PATH, ctx.config.basePath), url);
  consent.search = url.search;
  return redirectTo(consent.href);
}

const tokenRequestSchema = v.object({
  code: v.string(),
  redirect_uri: v.string(),
  client_id: v.string(),
  code_verifier: v.pipe(v.string(), v.minLength(43), v.maxLength(128)),
  resource: v.optional(v.string()),
});

const refreshRequestSchema = v.object({
  refresh_token: v.string(),
  client_id: v.string(),
  resource: v.optional(v.string()),
});

export async function handleToken(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  const contentType = ctx.request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return oauthError("invalid_request");
  }
  const form = new URLSearchParams(await ctx.request.text());
  switch (form.get("grant_type")) {
    case "authorization_code":
      return exchangeCode(ctx, form);
    case "refresh_token":
      return refresh(ctx, form);
    default:
      return oauthError("unsupported_grant_type");
  }
}

async function exchangeCode(
  ctx: AppContext,
  form: URLSearchParams,
): Promise<Response> {
  const parsed = v.safeParse(tokenRequestSchema, Object.fromEntries(form));
  if (!parsed.success) return oauthError("invalid_request");
  const input = parsed.output;

  const code = await consumeAuthorizationCode(ctx.db, input.code);
  if (
    code?.clientId !== input.client_id ||
    code.redirectUri !== input.redirect_uri ||
    (await s256(input.code_verifier)) !== code.codeChallenge
  ) {
    return oauthError("invalid_grant");
  }
  if ((input.resource ?? code.resource) !== code.resource) {
    return oauthError("invalid_target");
  }
  const grant = await findOAuthGrant(ctx.db, code.userId, code.clientId);
  if (grant === null) return oauthError("invalid_grant");
  const clientName = await resolveClientName(ctx, code.clientId);
  if (clientName === null) return oauthError("invalid_client", 401);
  return issueTokens(
    ctx,
    {
      grantId: grant.id,
      userId: code.userId,
      clientId: code.clientId,
      resource: code.resource,
      scopes: code.scopes,
    },
    clientName,
  );
}

async function refresh(
  ctx: AppContext,
  form: URLSearchParams,
): Promise<Response> {
  const parsed = v.safeParse(refreshRequestSchema, Object.fromEntries(form));
  if (!parsed.success) return oauthError("invalid_request");
  const input = parsed.output;

  const access = await findRefreshableAccess(ctx.db, input.refresh_token, {
    clientId: input.client_id,
    resource: input.resource,
  });
  if (typeof access === "string") return oauthError(access);
  const clientName = await resolveClientName(ctx, access.clientId);
  if (clientName === null) return oauthError("invalid_client", 401);
  if (!(await spendRefreshToken(ctx.db, access))) {
    return oauthError("invalid_grant");
  }
  return issueTokens(ctx, access, clientName);
}

async function resolveClientName(
  ctx: AppContext,
  clientId: string,
): Promise<string | null> {
  try {
    return (await resolveClient(ctx, clientId)).name;
  } catch (error) {
    if (!(error instanceof ClientMetadataError)) throw error;
    return null;
  }
}

async function issueTokens(
  ctx: AppContext,
  access: ApprovedAccess,
  clientName: string,
): Promise<Response> {
  const minted = await createApiToken(ctx.db, {
    userId: access.userId,
    name: clientName,
    expiresAt: new Date(now().getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    scopes: access.scopes,
    audience: access.resource,
    clientId: access.clientId,
  });
  const refreshToken = await issueRefreshToken(ctx.db, {
    grantId: access.grantId,
    resource: access.resource,
    scopes: access.scopes,
  });
  return jsonResponse({
    access_token: minted.secret,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
  });
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return encodeBase64url(new Uint8Array(digest));
}

function oauthError(error: string, status = 400): Response {
  return jsonResponse({ error }, { status });
}
