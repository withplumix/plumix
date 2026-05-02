import type { AppContext } from "../../context/app.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { OAuthErrorCode } from "./errors.js";
import type { OAuthClientConfig, OAuthProviderKey } from "./types.js";
import { users } from "../../db/schema/users.js";
import { buildSessionCookie, isSecureRequest } from "../cookies.js";
import { createSession } from "../sessions.js";
import { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
import { OAuthError } from "./errors.js";
import { resolveOAuthUser } from "./signup.js";
import { consumeOAuthState } from "./state.js";
import { OAUTH_PROVIDER_KEYS } from "./types.js";

const ADMIN_PATH = "/_plumix/admin";
const LOGIN_PATH = "/_plumix/admin/login";
const BOOTSTRAP_PATH = "/_plumix/admin/bootstrap";

// Defensive bound on `code` from the provider's redirect. GitHub's codes
// are ~20 chars; Google's a few hundred. 4 KiB is generous for any current
// provider while bounding URL/body amplification on a malformed callback.
const MAX_CODE_LENGTH = 4096;

interface OAuthRouteParams {
  readonly provider: OAuthProviderKey;
}

/**
 * Match `/_plumix/auth/oauth/<provider>/(start|callback)`. Returns the
 * provider + tail or null if the path doesn't match the OAuth shape.
 */
export function parseOAuthPath(
  pathname: string,
): { params: OAuthRouteParams; tail: "start" | "callback" } | null {
  const prefix = "/_plumix/auth/oauth/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const provider = rest.slice(0, slash);
  const tail = rest.slice(slash + 1);
  if (!isProviderKey(provider)) return null;
  if (tail !== "start" && tail !== "callback") return null;
  return { params: { provider }, tail };
}

function isProviderKey(value: string): value is OAuthProviderKey {
  return (OAUTH_PROVIDER_KEYS as readonly string[]).includes(value);
}

export async function handleOAuthStart(
  ctx: AppContext,
  app: PlumixApp,
  provider: OAuthProviderKey,
): Promise<Response> {
  const client = pickClient(app, provider);
  if (!client) return loginError("provider_not_configured");

  // Block OAuth on a fresh deploy. Bootstrap is passkey-only; an OAuth
  // signup before any user exists would either fail with a confusing
  // domain_not_allowed (no rows) or — if domains were pre-seeded — mint
  // a non-admin who can't actually do anything. Send to /bootstrap.
  const userCount = await ctx.db.$count(users);
  if (userCount === 0) {
    return redirectTo(BOOTSTRAP_PATH);
  }

  const redirectUri = oauthCallbackUrl(app, provider);

  try {
    const { url } = await buildAuthorizeUrl({
      db: ctx.db,
      provider,
      client,
      redirectUri,
    });
    return redirectTo(url);
  } catch (error) {
    ctx.logger.error("oauth_start_failed", { error, provider });
    return loginError("code_exchange_failed");
  }
}

export async function handleOAuthCallback(
  ctx: AppContext,
  app: PlumixApp,
  provider: OAuthProviderKey,
): Promise<Response> {
  const client = pickClient(app, provider);
  if (!client) return loginError("provider_not_configured");

  const url = new URL(ctx.request.url);
  const state = url.searchParams.get("state");

  // Provider-side denial (user clicked Cancel, scope rejected, etc.)
  // arrives as `?error=...`. The state row would otherwise sit until TTL;
  // consume it here so the slot is freed immediately.
  if (url.searchParams.has("error")) {
    if (state) await consumeOAuthState(ctx.db, state);
    return loginError("state_invalid");
  }

  const code = url.searchParams.get("code");
  if (!code || !state) return loginError("state_invalid");
  if (code.length > MAX_CODE_LENGTH) return loginError("state_invalid");

  const stored = await consumeOAuthState(ctx.db, state);
  if (!stored) return loginError("state_expired");
  if (stored.provider !== provider) return loginError("state_invalid");

  const redirectUri = oauthCallbackUrl(app, provider);

  try {
    const profile = await exchangeAndFetchProfile({
      provider,
      client,
      code,
      redirectUri,
      codeVerifier: stored.codeVerifier,
    });

    const { user } = await resolveOAuthUser(ctx.db, { provider, profile });

    const { token } = await createSession(
      ctx.db,
      { userId: user.id },
      app.sessionPolicy,
    );

    const cookie = buildSessionCookie(token, {
      maxAgeSeconds: app.sessionPolicy.maxAgeSeconds,
      secure: isSecureRequest(ctx.request),
      sameSite: "Lax",
    });

    return redirectTo(ADMIN_PATH, { "set-cookie": cookie });
  } catch (error) {
    if (error instanceof OAuthError) {
      ctx.logger.warn("oauth_callback_rejected", {
        provider,
        code: error.code,
      });
      return loginError(error.code);
    }
    ctx.logger.error("oauth_callback_failed", { error, provider });
    return loginError("code_exchange_failed");
  }
}

function pickClient(
  app: PlumixApp,
  provider: OAuthProviderKey,
): OAuthClientConfig | null {
  const oauth = app.config.auth.oauth;
  if (!oauth) return null;
  return oauth.providers[provider] ?? null;
}

// `app.origin` is the canonical site origin from passkey config — pinning
// the callback URL there means the value the provider sees at authorize
// time is identical at token-exchange time even if a load balancer or
// custom adapter rewrites Host on the way in. (Cloudflare Workers binds
// `request.url` to the connection hostname, but other adapters may not.)
function oauthCallbackUrl(app: PlumixApp, provider: OAuthProviderKey): string {
  return `${app.origin}/_plumix/auth/oauth/${provider}/callback`;
}

function redirectTo(
  location: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({ Location: location, ...extraHeaders });
  return new Response(null, { status: 302, headers });
}

function loginError(code: OAuthErrorCode): Response {
  const params = new URLSearchParams({ oauth_error: code });
  // Relative location — keeps the same scheme/host/port the browser
  // already used to reach us, no need to know the canonical origin.
  return redirectTo(`${LOGIN_PATH}?${params.toString()}`);
}
