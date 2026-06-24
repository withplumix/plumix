import type { AppContext } from "../../context/app.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { OAuthErrorCode } from "./errors.js";
import type { OAuthProviderClient } from "./types.js";
import { withBasePath } from "../../base-path.js";
import { users } from "../../db/schema/users.js";
import { loginErrorRedirect, redirectTo } from "../../runtime/http.js";
import { mintSessionAndCookie } from "../sign-in.js";
import { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
import { OAuthError } from "./errors.js";
import { resolveOAuthUser } from "./signup.js";
import { consumeOAuthState } from "./state.js";

const ADMIN_PATH = "/_plumix/admin";
const LOGIN_PATH = "/_plumix/admin/login";
const BOOTSTRAP_PATH = "/_plumix/admin/bootstrap";

// Defensive bound on `code` from the provider's redirect. GitHub's codes
// are ~20 chars; Google's a few hundred. 4 KiB is generous for any
// current provider while bounding URL/body amplification on a malformed
// callback.
const MAX_CODE_LENGTH = 4096;

export async function handleOAuthStart(
  ctx: AppContext,
  app: PlumixApp,
  providerKey: string,
): Promise<Response> {
  const provider = pickProvider(app, providerKey);
  if (!provider) return loginError(app.basePath, "provider_not_configured");

  // Block OAuth on a fresh deploy when the operator left bootstrap on
  // the passkey rail. An OAuth signup before any user exists would
  // either fail with a confusing domain_not_allowed (no rows) or — if
  // domains were pre-seeded — mint a non-admin who can't do anything.
  // Send to /bootstrap. With `bootstrapVia: "first-method-wins"` the
  // OAuth flow is the bootstrap; let it through.
  if (!ctx.bootstrapAllowed) {
    const userCount = await ctx.db.$count(users);
    if (userCount === 0) {
      return redirectTo(withBasePath(BOOTSTRAP_PATH, app.basePath));
    }
  }

  const redirectUri = oauthCallbackUrl(app, providerKey);

  try {
    const { url } = await buildAuthorizeUrl({
      db: ctx.db,
      providerKey,
      provider,
      redirectUri,
      env: ctx.env,
    });
    return redirectTo(url);
  } catch (error) {
    ctx.logger.error("oauth_start_failed", { error, provider: providerKey });
    return loginError(app.basePath, "code_exchange_failed");
  }
}

export async function handleOAuthCallback(
  ctx: AppContext,
  app: PlumixApp,
  providerKey: string,
): Promise<Response> {
  const provider = pickProvider(app, providerKey);
  if (!provider) return loginError(app.basePath, "provider_not_configured");

  const url = new URL(ctx.request.url);
  const state = url.searchParams.get("state");

  // Provider-side denial (user clicked Cancel, scope rejected, etc.)
  // arrives as `?error=...`. The state row would otherwise sit until
  // TTL; consume it here so the slot is freed immediately.
  if (url.searchParams.has("error")) {
    if (state) await consumeOAuthState(ctx.db, state);
    return loginError(app.basePath, "state_invalid");
  }

  const code = url.searchParams.get("code");
  if (!code || !state) return loginError(app.basePath, "state_invalid");
  if (code.length > MAX_CODE_LENGTH)
    return loginError(app.basePath, "state_invalid");

  const stored = await consumeOAuthState(ctx.db, state);
  if (!stored) return loginError(app.basePath, "state_expired");
  if (stored.provider !== providerKey)
    return loginError(app.basePath, "state_invalid");

  const redirectUri = oauthCallbackUrl(app, providerKey);

  try {
    const profile = await exchangeAndFetchProfile({
      provider,
      code,
      redirectUri,
      codeVerifier: stored.codeVerifier,
      env: ctx.env,
    });

    const { user, created } = await resolveOAuthUser(ctx.db, {
      provider: providerKey,
      profile,
      bootstrapAllowed: ctx.bootstrapAllowed,
    });

    const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);

    await ctx.hooks.doAction("user:signed_in", user, {
      method: "oauth",
      provider: providerKey,
      firstSignIn: created,
    });

    return redirectTo(withBasePath(ADMIN_PATH, app.basePath), {
      "set-cookie": cookieHeader,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      ctx.logger.warn("oauth_callback_rejected", {
        provider: providerKey,
        code: error.code,
      });
      return loginError(app.basePath, error.code);
    }
    ctx.logger.error("oauth_callback_failed", { error, provider: providerKey });
    return loginError(app.basePath, "code_exchange_failed");
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
  const path = `/_plumix/auth/oauth/${providerKey}/callback`;
  return `${app.origin}${withBasePath(path, app.basePath)}`;
}

function loginError(basePath: string, code: OAuthErrorCode): Response {
  // Relative location — keeps the same scheme/host/port the browser
  // already used to reach us, no need to know the canonical origin.
  return loginErrorRedirect(
    withBasePath(LOGIN_PATH, basePath),
    "oauth_error",
    code,
  );
}
