import type { AppContext, AuthenticatedUser } from "../context/app.js";
import { authenticateBearer, hasBearerToken } from "../auth/bearer.js";
import { withUser } from "../context/app.js";

// The lowest role: reads published content, holds no edit/admin capability.
// An anonymous REST request reads through this principal, so the entry
// services' existing status-clamping and hide-existence (404) policy applies
// unchanged — no REST-specific status filtering.
const PUBLIC_PRINCIPAL: AuthenticatedUser = {
  id: 0,
  email: "",
  role: "subscriber",
  meta: {},
};

export type RestPrincipal =
  | { readonly kind: "authed"; readonly ctx: AppContext }
  | { readonly kind: "anonymous"; readonly ctx: AppContext }
  | { readonly kind: "unauthorized" };

/**
 * Resolve the principal for a REST request. No bearer token → anonymous
 * read-only public principal. A bearer token must be valid: an expired /
 * revoked / disabled-user / malformed token is rejected outright (`unauthorized`)
 * rather than silently downgraded to anonymous, so a caller learns its
 * credential failed.
 */
export async function resolveRestPrincipal(
  ctx: AppContext,
): Promise<RestPrincipal> {
  if (!hasBearerToken(ctx.request)) {
    return { kind: "anonymous", ctx: withUser(ctx, PUBLIC_PRINCIPAL) };
  }
  const authed = await authenticateBearer(ctx);
  return authed ? { kind: "authed", ctx: authed } : { kind: "unauthorized" };
}
