import type { AppContext } from "../context/app-context.js";
import {
  authenticateTraced,
  requestHasSession,
  tokenScopesOf,
} from "../auth/authenticator.js";
import { withUser } from "../auth/with-user.js";

export async function loadUserForPublicRequest(
  ctx: AppContext,
): Promise<AppContext> {
  // Skip authentication for anonymous traffic, but let the configured guard
  // decide what "anonymous" means — a custom authenticator carries its session
  // by a different signal than the default cookie.
  if (!requestHasSession(ctx.authenticator, ctx.request)) {
    return ctx;
  }
  const result = await authenticateTraced(ctx, ctx.authenticator);
  if (result === null) {
    return ctx;
  }
  return withUser(ctx, result.user, tokenScopesOf(result));
}
