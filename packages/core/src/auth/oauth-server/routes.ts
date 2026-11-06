import * as v from "valibot";

import type { AppContext } from "../../context/app-context.js";
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
  consumeAuthorizationCode,
  findGrant,
  grantCovers,
  issueAuthorizationCode,
} from "./grants.js";
import { resolveScope } from "./scopes.js";

export { handleAuthorizationServerMetadata } from "./metadata.js";

/**
 * Must match the admin router's `/auth/authorize` page.
 * Guarded by: packages/core/src/auth/oauth-server/routes.test.ts
 */
const CONSENT_PATH = "/_plumix/admin/auth/authorize";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * RFC 6749 §4.1.1. A person whose grant already covers the request gets a code
 * at once; anyone else goes to the consent page, which signs them in first.
 */
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
    const granted = await findGrant(
      ctx.db,
      session.user.id,
      request.client.clientId,
    );
    const requested = resolveScope(
      request.scope,
      session.user.role,
      ctx.plugins,
    );
    if (granted !== null && grantCovers(granted, requested)) {
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

/**
 * RFC 6749 §4.1.3 for public clients: the PKCE verifier stands in for a client
 * secret. Errors are §5.2's.
 */
export async function handleToken(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  const contentType = ctx.request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return oauthError("invalid_request");
  }
  const form = new URLSearchParams(await ctx.request.text());
  if (form.get("grant_type") !== "authorization_code") {
    return oauthError("unsupported_grant_type");
  }
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

  let clientName: string;
  try {
    clientName = (await resolveClient(ctx, code.clientId)).name;
  } catch (error) {
    if (!(error instanceof ClientMetadataError)) throw error;
    return oauthError("invalid_client", 401);
  }
  const minted = await createApiToken(ctx.db, {
    userId: code.userId,
    name: clientName,
    expiresAt: new Date(now().getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    scopes: code.scopes,
    audience: code.resource,
    clientId: code.clientId,
  });
  return jsonResponse({
    access_token: minted.secret,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
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
