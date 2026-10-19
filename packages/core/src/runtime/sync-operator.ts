import type { AppContext } from "../context/app-context.js";
import { authenticateBearer, hasBearerToken } from "../auth/bearer.js";
import { forbidden, unauthorized } from "./contract/http.js";

/**
 * Bearer only, ahead of the CSRF gate: `plumix sync` calls with an API token,
 * whether or not the site serves its REST API.
 */
export async function authorizeSyncOperator(
  ctx: AppContext,
): Promise<AppContext | Response> {
  if (!hasBearerToken(ctx.request)) return unauthorized();
  const authed = await authenticateBearer(ctx);
  if (authed === null) return unauthorized();
  if (!authed.auth.can("settings:manage")) {
    return forbidden("settings_manage_required");
  }
  return authed;
}
