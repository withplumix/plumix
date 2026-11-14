import type { AppContext } from "../context/app-context.js";
import { hasBearerToken } from "../auth/bearer.js";
import { resolvePrincipal } from "../auth/principal.js";
import { forbidden, unauthorized } from "./contract/http.js";

/**
 * Bearer only, ahead of the CSRF gate: `plumix sync` calls with an API token.
 * A sync replaces whole tables, which no scope list covers, so a scoped token
 * is refused.
 */
export async function authorizeSyncOperator(
  ctx: AppContext,
): Promise<AppContext | Response> {
  if (!hasBearerToken(ctx.request)) return unauthorized();
  const authed = await resolvePrincipal(ctx, {
    kind: "bearer",
    audience: null,
  });
  if (authed === null) return unauthorized();
  if (authed.tokenScopes !== null) return forbidden("unscoped_token_required");
  if (!authed.auth.can("settings:manage")) {
    return forbidden("settings_manage_required");
  }
  return authed;
}
