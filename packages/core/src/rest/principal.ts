import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import { authenticateBearer, hasBearerToken } from "../auth/bearer.js";
import { makeAuthCan } from "../auth/with-user.js";

/**
 * Anonymous requests hold the lowest role's capabilities, so the entry
 * services' clamping applies unchanged. The principal stays nobody, which an
 * access policy reads.
 */
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
    return {
      kind: "anonymous",
      ctx: {
        ...ctx,
        user: null,
        tokenScopes: null,
        auth: { can: makeAuthCan(ctx.plugins, PUBLIC_PRINCIPAL, null) },
      },
    };
  }
  const authed = await authenticateBearer(ctx);
  return authed ? { kind: "authed", ctx: authed } : { kind: "unauthorized" };
}
