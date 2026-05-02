import type { Db } from "../../context/app.js";
import type { OAuthProfile, OAuthProviderClient } from "./types.js";
import { OAuthError } from "./errors.js";
import { computeS256Challenge, generateCodeVerifier } from "./pkce.js";
import { issueOAuthState } from "./state.js";

interface BuildAuthorizeUrlInput {
  readonly db: Db;
  readonly providerKey: string;
  readonly provider: OAuthProviderClient;
  readonly redirectUri: string;
}

interface BuiltAuthorizeUrl {
  readonly url: string;
  readonly state: string;
}

/**
 * Mint a PKCE verifier + state, persist them under `oauth_state`, and
 * return the authorize URL. State is what the provider echoes back; it's
 * the only way the callback ties the response to a verifier we can replay.
 */
export async function buildAuthorizeUrl(
  input: BuildAuthorizeUrlInput,
): Promise<BuiltAuthorizeUrl> {
  const { provider } = input;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeS256Challenge(codeVerifier);

  const { state } = await issueOAuthState(input.db, {
    provider: input.providerKey,
    codeVerifier,
  });

  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.client.clientId);
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
}

interface TokenResponse {
  readonly access_token: string;
  readonly id_token?: string;
  readonly token_type?: string;
}

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
    throw new OAuthError("email_missing");
  }

  return {
    providerAccountId: profile.providerAccountId,
    email: email.toLowerCase(),
    emailVerified,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  };
}

async function exchangeCode(
  input: ExchangeAndFetchInput,
): Promise<TokenResponse> {
  const { provider } = input;
  // RFC 6749 §2.3.1 / Copenhagen Book: client credentials go in the
  // Authorization header (HTTP Basic). client_id stays in the body for
  // providers (like Google) whose docs require it on the form too —
  // harmless when also present in the header.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: provider.client.clientId,
    code_verifier: input.codeVerifier,
  });
  const basic = btoa(
    `${provider.client.clientId}:${provider.client.clientSecret}`,
  );

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
    throw new OAuthError("code_exchange_failed", "network error");
  }

  if (!response.ok) {
    throw new OAuthError("code_exchange_failed", `status ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new OAuthError("code_exchange_failed", "non-json response");
  }

  if (
    !json ||
    typeof json !== "object" ||
    !("access_token" in json) ||
    typeof json.access_token !== "string"
  ) {
    throw new OAuthError("code_exchange_failed", "missing access_token");
  }
  return json as TokenResponse;
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
    throw new OAuthError("profile_fetch_failed", "network error");
  }

  if (!response.ok) {
    throw new OAuthError("profile_fetch_failed", `status ${response.status}`);
  }
  const raw: unknown = await response.json();
  return provider.parseProfile(raw);
}
