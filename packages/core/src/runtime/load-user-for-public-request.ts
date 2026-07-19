import type { AppContext } from "../context/app.js";
import { requestHasSession } from "../auth/authenticator.js";
import { withUser } from "../context/app.js";

export async function loadUserForPublicRequest(
  ctx: AppContext,
): Promise<AppContext> {
  // Skip authentication for anonymous traffic, but let the configured guard
  // decide what "anonymous" means — a custom authenticator carries its session
  // by a different signal than the default cookie.
  if (!requestHasSession(ctx.authenticator, ctx.request)) {
    return ctx;
  }
  const result = await ctx.authenticator.authenticate(ctx.request, ctx.db);
  if (result === null) {
    return ctx;
  }
  return withUser(ctx, result.user, result.tokenScopes ?? null);
}
