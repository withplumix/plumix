import * as v from "valibot";

import type { AppContext } from "../../context/app-context.js";
import type { OAuthClient } from "./client-metadata.js";
import type { McpScope } from "./urls.js";
import { getContext } from "../../context/stores.js";
import {
  acceptsRedirectUri,
  ClientMetadataError,
  createClientMetadataResolver,
} from "./client-metadata.js";
import { parseScope } from "./scopes.js";
import { issuer, mcpUrl } from "./urls.js";

/** Bounds each parameter, so a junk request can't carry megabytes. */
const param = v.optional(v.pipe(v.string(), v.maxLength(2048)));

/**
 * RFC 6749 §4.1.1 with PKCE (RFC 7636) and `resource` (RFC 8707), as the
 * client sent them; the consent page passes them through unchanged.
 */
export const authorizationParamsSchema = v.object({
  response_type: param,
  client_id: param,
  redirect_uri: param,
  scope: param,
  state: param,
  code_challenge: param,
  code_challenge_method: param,
  resource: param,
});

export type AuthorizationParams = v.InferOutput<
  typeof authorizationParamsSchema
>;

export interface AuthorizationRequest {
  readonly client: OAuthClient;
  readonly redirectUri: string;
  readonly state: string | undefined;
  readonly scope: McpScope;
  readonly codeChallenge: string;
  readonly resource: string;
}

type AuthorizationRefusal =
  /** The client or its redirect URI is unproven, so nothing is sent there. */
  | { readonly redirect: false; readonly error: string }
  | {
      readonly redirect: true;
      readonly error: string;
      readonly redirectUri: string;
      readonly state: string | undefined;
    };

export type ValidatedAuthorization =
  | { readonly ok: true; readonly request: AuthorizationRequest }
  | { readonly ok: false; readonly refusal: AuthorizationRefusal };

/** A base64url SHA-256 digest is 43 characters. */
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Keyed by the site's config, so each site caches its own clients. Fetches
 * through the current request's `ctx.fetch`.
 */
const resolvers = new WeakMap<
  object,
  ReturnType<typeof createClientMetadataResolver>
>();

function resolverFor(ctx: AppContext) {
  let resolver = resolvers.get(ctx.config);
  if (resolver === undefined) {
    resolver = createClientMetadataResolver({
      fetch: (input, init) => getContext().fetch(input, init),
    });
    resolvers.set(ctx.config, resolver);
  }
  return resolver;
}

/** The client a `client_id` names, or the reason its document was refused. */
export function resolveClient(
  ctx: AppContext,
  clientId: string,
): Promise<OAuthClient> {
  return resolverFor(ctx).resolve(clientId);
}

/**
 * Checks the client and its redirect URI first: until both hold, an error
 * can't be sent back to the client (RFC 6749 §4.1.2.1).
 */
export async function validateAuthorizationRequest(
  ctx: AppContext,
  params: AuthorizationParams,
): Promise<ValidatedAuthorization> {
  if (params.client_id === undefined) {
    return { ok: false, refusal: { redirect: false, error: "invalid_client" } };
  }
  let client: OAuthClient;
  try {
    client = await resolveClient(ctx, params.client_id);
  } catch (error) {
    if (!(error instanceof ClientMetadataError)) throw error;
    return { ok: false, refusal: { redirect: false, error: "invalid_client" } };
  }
  const redirectUri = params.redirect_uri;
  if (redirectUri === undefined || !acceptsRedirectUri(client, redirectUri)) {
    return {
      ok: false,
      refusal: { redirect: false, error: "invalid_request" },
    };
  }

  const refuse = (error: string): ValidatedAuthorization => ({
    ok: false,
    refusal: { redirect: true, error, redirectUri, state: params.state },
  });
  if (params.response_type !== "code") {
    return refuse("unsupported_response_type");
  }
  if (
    params.code_challenge_method !== "S256" ||
    params.code_challenge === undefined ||
    !S256_CHALLENGE.test(params.code_challenge)
  ) {
    return refuse("invalid_request");
  }
  if (params.resource !== mcpUrl(ctx).href) return refuse("invalid_target");
  const scope = parseScope(params.scope);
  if (scope === null) return refuse("invalid_scope");

  return {
    ok: true,
    request: {
      client,
      redirectUri,
      state: params.state,
      scope,
      codeChallenge: params.code_challenge,
      resource: params.resource,
    },
  };
}

/** RFC 6749 §4.1.2, with `iss` from RFC 9207. */
export function authorizationResponseUrl(
  ctx: AppContext,
  target: { readonly redirectUri: string; readonly state: string | undefined },
  result: Readonly<Record<string, string>>,
): string {
  const url = new URL(target.redirectUri);
  for (const [key, value] of Object.entries(result)) {
    url.searchParams.set(key, value);
  }
  if (target.state !== undefined) url.searchParams.set("state", target.state);
  url.searchParams.set("iss", issuer(ctx));
  return url.href;
}
