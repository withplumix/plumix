import type { Db } from "../../context/app.js";
import type {
  OAuthClientConfig,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderKey,
} from "./types.js";
import { OAuthError } from "./errors.js";
import { computeS256Challenge, generateCodeVerifier } from "./pkce.js";
import { fetchPrimaryEmail, getProvider } from "./providers/index.js";
import { issueOAuthState } from "./state.js";

export interface BuildAuthorizeUrlInput {
  readonly db: Db;
  readonly provider: OAuthProviderKey;
  readonly client: OAuthClientConfig;
  readonly redirectUri: string;
}

export interface BuiltAuthorizeUrl {
  readonly url: string;
  readonly state: string;
}

/**
 * Mint a PKCE verifier + state, persist them under `oauth_state`, and return
 * the authorize URL. State is what the provider echoes back; it's the only
 * way the callback ties the response to a verifier we can replay.
 */
export async function buildAuthorizeUrl(
  input: BuildAuthorizeUrlInput,
): Promise<BuiltAuthorizeUrl> {
  const provider = getProvider(input.provider);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeS256Challenge(codeVerifier);

  const { state } = await issueOAuthState(input.db, {
    provider: input.provider,
    codeVerifier,
  });

  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", input.client.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Google requires this to surface email_verified on the userinfo endpoint
  // for accounts that aren't currently signed in. Harmless for GitHub.
  if (input.provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return { url: url.toString(), state };
}

export interface ExchangeAndFetchInput {
  readonly provider: OAuthProviderKey;
  readonly client: OAuthClientConfig;
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
 * Exchange the authorization code for tokens, then fetch the user's profile.
 * Returns a normalised OAuthProfile or throws OAuthError on any step
 * failure — the route layer maps codes to user-facing messages.
 */
export async function exchangeAndFetchProfile(
  input: ExchangeAndFetchInput,
): Promise<OAuthProfile> {
  const provider = getProvider(input.provider);
  const tokens = await exchangeCode(provider, input);
  const profile = await fetchProfile(provider, tokens.access_token);

  let { email, emailVerified } = profile;
  if (input.provider === "github" && !email) {
    const primary = await fetchPrimaryEmail(tokens.access_token);
    if (primary) {
      email = primary.email;
      emailVerified = primary.verified;
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
  provider: OAuthProvider,
  input: ExchangeAndFetchInput,
): Promise<TokenResponse> {
  // RFC 6749 §2.3.1 / Copenhagen Book: client credentials go in the
  // Authorization header (HTTP Basic). client_id stays in the body for
  // providers (like Google) whose docs require it on the form too —
  // harmless when also present in the header.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.client.clientId,
    code_verifier: input.codeVerifier,
  });
  const basic = btoa(`${input.client.clientId}:${input.client.clientSecret}`);

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
  provider: OAuthProvider,
  accessToken: string,
): Promise<ReturnType<OAuthProvider["parseProfile"]>> {
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
