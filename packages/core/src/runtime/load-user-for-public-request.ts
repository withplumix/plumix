import type { AppContext } from "../context/app.js";
import { readSessionCookie } from "../auth/cookies.js";
import { withUser } from "../context/app.js";

export async function loadUserForPublicRequest(
  ctx: AppContext,
): Promise<AppContext> {
  if (readSessionCookie(ctx.request) === null) {
    return ctx;
  }
  const result = await ctx.authenticator.authenticate(ctx.request, ctx.db);
  if (result === null) {
    return ctx;
  }
  return withUser(ctx, result.user, result.tokenScopes ?? null);
}
