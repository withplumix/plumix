import type { AuthMethodKernel } from "../../plugin/auth-method.js";
import type { OAuthProviderClient } from "../contract/oauth.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { OAuthErrorCode } from "./errors.js";
import { withBasePath } from "../../base-path.js";
import { users } from "../../db/schema/users.js";
import { redirectTo } from "../../runtime/contract/http.js";
import { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
import { OAuthError } from "./errors.js";
import { consumeOAuthState } from "./state.js";

const BOOTSTRAP_PATH = "/_plumix/admin/bootstrap";

/**
 * Real codes are at most a few hundred chars; the bound limits amplification on
 * a malformed callback.
 */
const MAX_CODE_LENGTH = 4096;

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
    const { url } = await buildAuthorizeUrl({
      db: ctx.db,
      providerKey,
      provider,
      redirectUri,
      env: ctx.env,
      redirectTo: auth.readRedirectTo(),
    });
    return redirectTo(url);
  } catch (error) {
    ctx.logger.error("oauth_start_failed", { error, provider: providerKey });
    return auth.fail("code_exchange_failed");
  }
}

export async function handleOAuthCallback(
  auth: OAuthKernel,
  app: AuthFlowApp,
): Promise<Response> {
  const { ctx } = auth;
  const providerKey = auth.params.provider ?? "";
  const provider = pickProvider(app, providerKey);
  if (!provider) return auth.fail("provider_not_configured");

  const url = new URL(auth.request.url);
  const state = url.searchParams.get("state");

  // Provider-side denial (user clicked Cancel, scope rejected, etc.)
  // arrives as `?error=...`. The state row would otherwise sit until
  // TTL; consume it here so the slot is freed immediately.
  if (url.searchParams.has("error")) {
    if (state) await consumeOAuthState(ctx.db, state);
    return auth.fail("state_invalid");
  }

  const code = url.searchParams.get("code");
  if (!code || !state) return auth.fail("state_invalid");
  if (code.length > MAX_CODE_LENGTH) return auth.fail("state_invalid");

  const stored = await consumeOAuthState(ctx.db, state);
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
