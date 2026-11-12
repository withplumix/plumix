import type { AuthMethodKernel } from "../../plugin/auth-method.js";
import type { OAuthProviderClient } from "../contract/oauth.js";
import type { SessionCookieOptions } from "../cookies.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { OAuthErrorCode } from "./errors.js";
import { withBasePath } from "../../base-path.js";
import { users } from "../../db/schema/users.js";
import { readCookie } from "../../read-cookie.js";
import { redirectTo } from "../../runtime/contract/http.js";
import {
  buildSessionCookie,
  buildSessionDeletionCookie,
  isSecureRequest,
} from "../cookies.js";
import { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
import { OAuthError } from "./errors.js";
import { consumeOAuthState, OAUTH_STATE_TTL_SECONDS } from "./state.js";

const BOOTSTRAP_PATH = "/_plumix/admin/bootstrap";

/**
 * Real codes are at most a few hundred chars; the bound limits amplification on
 * a malformed callback.
 */
const MAX_CODE_LENGTH = 4096;

/** Ties a sign-in to the browser that started it. */
const BROWSER_NONCE_COOKIE = "plumix_oauth_state";

type OAuthKernel = AuthMethodKernel<OAuthErrorCode>;

export async function handleOAuthStart(
  auth: OAuthKernel,
  app: AuthFlowApp,
): Promise<Response> {
  const { ctx } = auth;
  const providerKey = auth.params.provider ?? "";
  const provider = pickProvider(app, providerKey);
  if (!provider) return auth.fail("provider_not_configured");

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

  try {
    const { url, browserNonce } = await buildAuthorizeUrl({
      db: ctx.db,
      providerKey,
      provider,
      redirectUri,
      env: ctx.env,
      redirectTo: auth.readRedirectTo(),
    });
    return redirectTo(url, {
      "set-cookie": buildSessionCookie(browserNonce, {
        ...browserNonceCookie(auth.request, app, providerKey),
        maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
      }),
    });
  } catch (error) {
    ctx.logger.error("oauth_start_failed", { error, provider: providerKey });
    return auth.fail("code_exchange_failed");
  }
}

export async function handleOAuthCallback(
  auth: OAuthKernel,
  app: AuthFlowApp,
): Promise<Response> {
  const response = await finishOAuthSignIn(auth, app);
  response.headers.append(
    "set-cookie",
    buildSessionDeletionCookie(
      browserNonceCookie(auth.request, app, auth.params.provider ?? ""),
    ),
  );
  return response;
}

async function finishOAuthSignIn(
  auth: OAuthKernel,
  app: AuthFlowApp,
): Promise<Response> {
  const { ctx } = auth;
  const providerKey = auth.params.provider ?? "";
  const provider = pickProvider(app, providerKey);
  if (!provider) return auth.fail("provider_not_configured");

  const url = new URL(auth.request.url);
  const state = url.searchParams.get("state");
  const browserNonce = readCookie(auth.request, BROWSER_NONCE_COOKIE);

  // Provider-side denial (user clicked Cancel, scope rejected, etc.)
  // arrives as `?error=...`. The state row would otherwise sit until
  // TTL; the browser that started it frees the slot here.
  if (url.searchParams.has("error")) {
    if (state && browserNonce) {
      await consumeOAuthState(ctx.db, state, browserNonce);
    }
    return auth.fail("state_invalid");
  }

  const code = url.searchParams.get("code");
  if (!code || !state || !browserNonce) return auth.fail("state_invalid");
  if (code.length > MAX_CODE_LENGTH) return auth.fail("state_invalid");

  const stored = await consumeOAuthState(ctx.db, state, browserNonce);
  if (!stored) return auth.fail("state_expired");
  if (stored.provider !== providerKey) return auth.fail("state_invalid");

  const redirectUri = oauthCallbackUrl(
    ctx.origin,
    app.config.basePath,
    providerKey,
  );

  let profile;
  try {
    profile = await exchangeAndFetchProfile({
      provider,
      code,
      redirectUri,
      codeVerifier: stored.codeVerifier,
      env: ctx.env,
      fetch: ctx.fetch,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      ctx.logger.warn("oauth_callback_rejected", {
        provider: providerKey,
        code: error.code,
      });
      return auth.fail(error.code);
    }
    ctx.logger.error("oauth_callback_failed", { error, provider: providerKey });
    return auth.fail("code_exchange_failed");
  }

  return auth.proveIdentity(
    {
      email: profile.email,
      emailVerified: profile.emailVerified,
      providerAccount: {
        provider: providerKey,
        accountId: profile.providerAccountId,
      },
      profile: { name: profile.name, avatarUrl: profile.avatarUrl },
    },
    { redirectTo: stored.redirectTo },
  );
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

/** Per provider, so starting another provider's sign-in leaves this one's. */
function browserNonceCookie(
  request: Request,
  app: AuthFlowApp,
  providerKey: string,
): Pick<SessionCookieOptions, "name" | "secure" | "path"> {
  return {
    name: BROWSER_NONCE_COOKIE,
    secure: isSecureRequest(request),
    path: withBasePath(
      `/_plumix/auth/oauth/${providerKey}`,
      app.config.basePath,
    ),
  };
}

/**
 * Pinned to the canonical origin so authorize and token exchange send the same
 * URL even if a proxy rewrites Host.
 */
function oauthCallbackUrl(
  origin: string,
  basePath: string,
  providerKey: string,
): string {
  const path = `/_plumix/auth/oauth/${providerKey}/callback`;
  return `${origin}${withBasePath(path, basePath)}`;
}
