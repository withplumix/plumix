import type { AppContext } from "../context/app-context.js";
import { hasBearerToken } from "../auth/bearer.js";
import { resolvePrincipal } from "../auth/principal.js";
import { makeAuthCan } from "../auth/with-user.js";
import { ANONYMOUS_PRINCIPAL } from "../context/anonymous-principal.js";
import { rebindSettings } from "../context/settings-namespace.js";
import { rebindDispatch } from "../events-and-filters/dispatch.js";

/**
 * Asked as a `member`, so the entry services clamp it like any reader; an
 * access policy still sees nobody.
 */
function anonymousReadsAsMember(ctx: AppContext): AppContext {
  const anonymous: AppContext = {
    ...ctx,
    ...ANONYMOUS_PRINCIPAL,
    auth: { can: makeAuthCan(ctx.plugins, { role: "member" }, null) },
    settings: rebindSettings(ctx.settings, () => anonymous),
    ...rebindDispatch(ctx, () => anonymous),
  };
  return anonymous;
}

export type RestPrincipal =
  | { readonly kind: "authed"; readonly ctx: AppContext }
  | { readonly kind: "anonymous"; readonly ctx: AppContext }
  | { readonly kind: "unauthorized" };

/**
 * An invalid bearer token is rejected (`unauthorized`) rather than downgraded
 * to anonymous, so a caller learns its credential failed.
 */
export async function resolveRestPrincipal(
  ctx: AppContext,
): Promise<RestPrincipal> {
  if (!hasBearerToken(ctx.request)) {
    return { kind: "anonymous", ctx: anonymousReadsAsMember(ctx) };
  }
  const authed = await resolvePrincipal(ctx, {
    kind: "bearer",
    audience: null,
  });
  return authed ? { kind: "authed", ctx: authed } : { kind: "unauthorized" };
}
