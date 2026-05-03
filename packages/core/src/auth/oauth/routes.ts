import type { AppContext } from "../../context/app.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { OAuthErrorCode } from "./errors.js";
import type { OAuthProviderClient } from "./types.js";
import { users } from "../../db/schema/users.js";
import { buildSessionCookie, isSecureRequest } from "../cookies.js";
import { createSession, readRequestMeta } from "../sessions.js";
import { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
import { OAuthError } from "./errors.js";
import { resolveOAuthUser } from "./signup.js";
import { consumeOAuthState } from "./state.js";
import { OAUTH_PROVIDER_KEY_PATTERN } from "./types.js";

const ADMIN_PATH = "/_plumix/admin";
const LOGIN_PATH = "/_plumix/admin/login";
const BOOTSTRAP_PATH = "/_plumix/admin/bootstrap";

// Defensive bound on `code` from the provider's redirect. GitHub's codes
// are ~20 chars; Google's a few hundred. 4 KiB is generous for any
// current provider while bounding URL/body amplification on a malformed
// callback.
const MAX_CODE_LENGTH = 4096;

interface OAuthRouteParams {
  readonly providerKey: string;
}

/**
 * Match `/_plumix/auth/oauth/<key>/(start|callback)`. The shape check
 * (alphanum + `_-`) happens here; existence check ("is this a configured
 * provider?") happens in the handler. A path that doesn't match the
 * shape returns null → 404 from the dispatcher.
 */
export function parseOAuthPath(
  pathname: string,
): { params: OAuthRouteParams; tail: "start" | "callback" } | null {
  const prefix = "/_plumix/auth/oauth/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const providerKey = rest.slice(0, slash);
  const tail = rest.slice(slash + 1);
  if (!OAUTH_PROVIDER_KEY_PATTERN.test(providerKey)) return null;
  if (tail !== "start" && tail !== "callback") return null;
  return { params: { providerKey }, tail };
}

export async function handleOAuthStart(
  ctx: AppContext,
  app: PlumixApp,
  providerKey: string,
): Promise<Response> {
  const provider = pickProvider(app, providerKey);
  if (!provider) return loginError("provider_not_configured");

  // Block OAuth on a fresh deploy when the operator left bootstrap on
  // the passkey rail. An OAuth signup before any user exists would
  // either fail with a confusing domain_not_allowed (no rows) or — if
  // domains were pre-seeded — mint a non-admin who can't do anything.
  // Send to /bootstrap. With `bootstrapVia: "first-method-wins"` the
  // OAuth flow is the bootstrap; let it through.
  if (!ctx.bootstrapAllowed) {
    const userCount = await ctx.db.$count(users);
    if (userCount === 0) {
      return redirectTo(BOOTSTRAP_PATH);
    }
  }

  const redirectUri = oauthCallbackUrl(app, providerKey);

  try {
    const { url } = await buildAuthorizeUrl({
      db: ctx.db,
      providerKey,
      provider,
      redirectUri,
    });
    return redirectTo(url);
  } catch (error) {
    ctx.logger.error("oauth_start_failed", { error, provider: providerKey });
    return loginError("code_exchange_failed");
  }
}

export async function handleOAuthCallback(
  ctx: AppContext,
  app: PlumixApp,
  providerKey: string,
): Promise<Response> {
  const provider = pickProvider(app, providerKey);
  if (!provider) return loginError("provider_not_configured");

  const url = new URL(ctx.request.url);
  const state = url.searchParams.get("state");

  // Provider-side denial (user clicked Cancel, scope rejected, etc.)
  // arrives as `?error=...`. The state row would otherwise sit until
  // TTL; consume it here so the slot is freed immediately.
  if (url.searchParams.has("error")) {
    if (state) await consumeOAuthState(ctx.db, state);
    return loginError("state_invalid");
  }

  const code = url.searchParams.get("code");
  if (!code || !state) return loginError("state_invalid");
  if (code.length > MAX_CODE_LENGTH) return loginError("state_invalid");

  const stored = await consumeOAuthState(ctx.db, state);
  if (!stored) return loginError("state_expired");
  if (stored.provider !== providerKey) return loginError("state_invalid");

  const redirectUri = oauthCallbackUrl(app, providerKey);

  try {
    const profile = await exchangeAndFetchProfile({
      provider,
      code,
      redirectUri,
      codeVerifier: stored.codeVerifier,
    });

    const { user } = await resolveOAuthUser(ctx.db, {
      provider: providerKey,
      profile,
      bootstrapAllowed: ctx.bootstrapAllowed,
    });

    const { token } = await createSession(
      ctx.db,
      { userId: user.id, ...readRequestMeta(ctx.request) },
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
        provider: providerKey,
        code: error.code,
      });
      return loginError(error.code);
    }
    ctx.logger.error("oauth_callback_failed", { error, provider: providerKey });
    return loginError("code_exchange_failed");
  }
}

function pickProvider(app: PlumixApp, key: string): OAuthProviderClient | null {
  // `OAUTH_PROVIDER_KEY_PATTERN` rejects most prototype-chain keys at the
  // path layer (`__proto__`, `hasOwnProperty`, …), but `constructor`
  // matches the regex. `Object.hasOwn` keeps the lookup confined to the
  // operator's `auth.oauth.providers` object instead of walking the
  // prototype chain.
  const providers = app.config.auth.oauth?.providers;
  if (!providers || !Object.hasOwn(providers, key)) return null;
  return providers[key] ?? null;
}

// `app.origin` is the canonical site origin from passkey config — pinning
// the callback URL there means the value the provider sees at authorize
// time is identical at token-exchange time even if a load balancer or
// custom adapter rewrites Host on the way in. (Cloudflare Workers binds
// `request.url` to the connection hostname, but other adapters may not.)
function oauthCallbackUrl(app: PlumixApp, providerKey: string): string {
  return `${app.origin}/_plumix/auth/oauth/${providerKey}/callback`;
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
