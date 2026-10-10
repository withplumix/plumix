import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import { authenticateBearer, hasBearerToken } from "../auth/bearer.js";
import { withUser } from "../auth/with-user.js";

// Anonymous requests read through the lowest role, so the entry services'
// status clamping and hide-existence policy apply unchanged.
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
 * An invalid bearer token is rejected (`unauthorized`) rather than downgraded
 * to anonymous, so a caller learns its credential failed.
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
