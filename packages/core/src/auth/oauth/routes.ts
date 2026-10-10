import type { AppContext } from "../../context/app-context.js";
import type { OAuthProviderClient } from "../contract/oauth.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { OAuthErrorCode } from "./errors.js";
import { withBasePath } from "../../base-path.js";
import { users } from "../../db/schema/users.js";
import { startingMeta } from "../../plugin/fields/starting-meta.js";
import { listUserMetaFields } from "../../plugin/manifest.js";
import { loginErrorRedirect, redirectTo } from "../../runtime/contract/http.js";
import { resolveLoginPath } from "../config.js";
import { isSafeRedirect, resolveSafeRedirect } from "../redirect.js";
import { announceSignIn, mintSessionAndCookie } from "../sign-in.js";
import { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
import { OAuthError } from "./errors.js";
import { resolveOAuthUser } from "./signup.js";
import { consumeOAuthState } from "./state.js";

const ADMIN_PATH = "/_plumix/admin";
const BOOTSTRAP_PATH = "/_plumix/admin/bootstrap";

// Real codes are at most a few hundred chars; the bound limits amplification on
// a malformed callback.
const MAX_CODE_LENGTH = 4096;

export async function handleOAuthStart(
  ctx: AppContext,
  app: AuthFlowApp,
  providerKey: string,
): Promise<Response> {
  const provider = pickProvider(app, providerKey);
  if (!provider) return loginError(app, "provider_not_configured");

  // A signup before any user exists would fail confusingly or mint a powerless
  // non-admin.
  if (!ctx.bootstrapAllowed) {
    const userCount = await ctx.db.$count(users);
    if (userCount === 0) {
      return redirectTo(withBasePath(BOOTSTRAP_PATH, app.config.basePath));
    }
  }

  const redirectUri = oauthCallbackUrl(
    ctx.origin,
    app.config.basePath,
    providerKey,
  );

  // Filtered here to keep junk out of the state row; the callback re-validates.
  const requested = new URL(ctx.request.url).searchParams.get("redirectTo");
  const redirectToPath = isSafeRedirect(requested) ? requested : undefined;

  try {
    const { url } = await buildAuthorizeUrl({
      db: ctx.db,
      providerKey,
      provider,
      redirectUri,
      env: ctx.env,
      redirectTo: redirectToPath,
    });
    return redirectTo(url);
  } catch (error) {
    ctx.logger.error("oauth_start_failed", { error, provider: providerKey });
    return loginError(app, "code_exchange_failed");
  }
}

export async function handleOAuthCallback(
  ctx: AppContext,
  app: AuthFlowApp,
  providerKey: string,
): Promise<Response> {
  const provider = pickProvider(app, providerKey);
  if (!provider) return loginError(app, "provider_not_configured");

  const url = new URL(ctx.request.url);
  const state = url.searchParams.get("state");

  // Provider-side denial (user clicked Cancel, scope rejected, etc.)
  // arrives as `?error=...`. The state row would otherwise sit until
  // TTL; consume it here so the slot is freed immediately.
  if (url.searchParams.has("error")) {
    if (state) await consumeOAuthState(ctx.db, state);
    return loginError(app, "state_invalid");
  }

  const code = url.searchParams.get("code");
  if (!code || !state) return loginError(app, "state_invalid");
  if (code.length > MAX_CODE_LENGTH) return loginError(app, "state_invalid");

  const stored = await consumeOAuthState(ctx.db, state);
  if (!stored) return loginError(app, "state_expired");
  if (stored.provider !== providerKey) return loginError(app, "state_invalid");

  const redirectUri = oauthCallbackUrl(
    ctx.origin,
    app.config.basePath,
    providerKey,
  );

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
      selfSignup: app.config.auth.selfSignup,
      meta: startingMeta(listUserMetaFields(ctx.plugins)),
    });

    const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);

    await announceSignIn(ctx, user, {
      method: "oauth",
      provider: providerKey,
      firstSignIn: created,
    });

    // Already root-relative and includes any basePath, so honoured verbatim.
    const destination = resolveSafeRedirect(
      stored.redirectTo,
      withBasePath(ADMIN_PATH, app.config.basePath),
    );
    return redirectTo(destination, {
      "set-cookie": cookieHeader,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      ctx.logger.warn("oauth_callback_rejected", {
        provider: providerKey,
        code: error.code,
      });
      return loginError(app, error.code);
    }
    ctx.logger.error("oauth_callback_failed", { error, provider: providerKey });
    return loginError(app, "code_exchange_failed");
  }
}

function pickProvider(
  app: AuthFlowApp,
  key: string,
): OAuthProviderClient | null {
  // `constructor` passes the key pattern; `Object.hasOwn` stops the lookup
  // walking the prototype chain.
  const providers = app.config.auth.oauth?.providers;
  if (!providers || !Object.hasOwn(providers, key)) return null;
  return providers[key] ?? null;
}

// Pinned to the canonical origin so authorize and token exchange send the same
// URL even if a proxy rewrites Host.
function oauthCallbackUrl(
  origin: string,
  basePath: string,
  providerKey: string,
): string {
  const path = `/_plumix/auth/oauth/${providerKey}/callback`;
  return `${origin}${withBasePath(path, basePath)}`;
}

function loginError(app: AuthFlowApp, code: OAuthErrorCode): Response {
  // Relative location — keeps the same scheme/host/port the browser
  // already used to reach us, no need to know the canonical origin.
  return loginErrorRedirect(
    withBasePath(resolveLoginPath(app.config.auth), app.config.basePath),
    "oauth_error",
    code,
  );
}
