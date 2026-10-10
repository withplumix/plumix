import * as v from "valibot";

import type { Db } from "../../context/app-context.js";
import type { PlumixEnv } from "../../runtime/contract/bindings.js";
import type { OAuthProfile, OAuthProviderClient } from "../contract/oauth.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";
import { OAuthError } from "./errors.js";
import { computeS256Challenge, generateCodeVerifier } from "./pkce.js";
import { issueOAuthState } from "./state.js";

interface BuildAuthorizeUrlInput {
  readonly db: Db;
  readonly providerKey: string;
  readonly provider: OAuthProviderClient;
  readonly redirectUri: string;
  readonly env: PlumixEnv;
  readonly redirectTo?: string;
}

interface BuiltAuthorizeUrl {
  readonly url: string;
  readonly state: string;
}

export async function buildAuthorizeUrl(
  input: BuildAuthorizeUrlInput,
): Promise<BuiltAuthorizeUrl> {
  const { provider } = input;
  const client = resolveEnvInput(provider.client, input.env);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeS256Challenge(codeVerifier);

  const { state } = await issueOAuthState(input.db, {
    provider: input.providerKey,
    codeVerifier,
    // Undefined is dropped from the persisted JSON payload, so an admin-
    // originated sign-in stores exactly what it did before.
    redirectTo: input.redirectTo,
  });

  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  provider.decorateAuthorizeUrl?.(url);

  return { url: url.toString(), state };
}

interface ExchangeAndFetchInput {
  readonly provider: OAuthProviderClient;
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
  readonly env: PlumixEnv;
}

/**
 * Providers may send unread fields like `id_token` as null; validating them
 * would fail the login.
 */
const tokenResponseSchema = v.looseObject({ access_token: v.string() });

type TokenResponse = v.InferOutput<typeof tokenResponseSchema>;

/**
 * Exchange the authorization code for tokens, then fetch the user's
 * profile. Returns a normalised OAuthProfile or throws OAuthError on any
 * step failure — the route layer maps codes to user-facing messages.
 */
export async function exchangeAndFetchProfile(
  input: ExchangeAndFetchInput,
): Promise<OAuthProfile> {
  const { provider } = input;
  const tokens = await exchangeCode(input);
  const profile = await fetchProfile(provider, tokens.access_token);

  let { email, emailVerified } = profile;
  if (!email && provider.fetchVerifiedEmail) {
    const fallback = await provider.fetchVerifiedEmail(tokens.access_token);
    if (fallback) {
      email = fallback.email;
      emailVerified = fallback.verified;
    }
  }

  if (!email) {
    throw OAuthError.emailMissing();
  }

  return {
    providerAccountId: profile.providerAccountId,
    // A padded email would miss the `users.email` lookup and then hit the
    // UNIQUE constraint on signup.
    email: email.trim().toLowerCase(),
    emailVerified,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  };
}

async function exchangeCode(
  input: ExchangeAndFetchInput,
): Promise<TokenResponse> {
  const { provider } = input;
  const client = resolveEnvInput(provider.client, input.env);
  // RFC 6749 §2.3.1 puts credentials in HTTP Basic; client_id stays in the body
  // because Google requires it there too.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: client.clientId,
    code_verifier: input.codeVerifier,
  });
  const basic = btoa(`${client.clientId}:${client.clientSecret}`);

  let response: Response;
  try {
    response = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch {
    throw OAuthError.codeExchangeFailed({ reason: "network error" });
  }

  if (!response.ok) {
    throw OAuthError.codeExchangeFailed({
      reason: `status ${response.status}`,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw OAuthError.codeExchangeFailed({ reason: "non-json response" });
  }

  const tokens = v.safeParse(tokenResponseSchema, json);
  if (!tokens.success) {
    throw OAuthError.codeExchangeFailed({ reason: "missing access_token" });
  }
  return tokens.output;
}

async function fetchProfile(
  provider: OAuthProviderClient,
  accessToken: string,
): Promise<ReturnType<OAuthProviderClient["parseProfile"]>> {
  let response: Response;
  try {
    response = await fetch(provider.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "plumix",
      },
    });
  } catch {
    throw OAuthError.profileFetchFailed({ reason: "network error" });
  }

  if (!response.ok) {
    throw OAuthError.profileFetchFailed({
      reason: `status ${response.status}`,
    });
  }
  const raw: unknown = await response.json();
  return provider.parseProfile(raw);
}
