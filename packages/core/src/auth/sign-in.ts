import type { AppContext } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import type { ActionArgs } from "../hooks/types.js";
import type { AuthFlowApp } from "./flow-app.js";
import { withBasePath } from "../base-path.js";
import { buildSessionCookie, isSecureRequest } from "./cookies.js";
import { createSession, readClientMeta } from "./sessions.js";

interface MintedSession {
  readonly token: string;
  readonly cookieHeader: string;
}

export async function mintSessionAndCookie(
  ctx: AppContext,
  app: AuthFlowApp,
  userId: number,
): Promise<MintedSession> {
  const { token } = await createSession(
    ctx.db,
    { userId, ...readClientMeta(ctx) },
    app.sessionPolicy,
  );
  const cookieHeader = buildSessionCookie(token, {
    maxAgeSeconds: app.sessionPolicy.maxAgeSeconds,
    secure: isSecureRequest(ctx.request),
    sameSite: "Lax",
    // Scope the session to the subdirectory so it isn't sent to a sibling
    // app on the same host (`""` → `/`, the host-wide default).
    path: withBasePath("/", app.config.basePath),
  });
  return { token, cookieHeader };
}

/**
 * Flows take `firstSignIn` from their own ceremony: sessions are deleted on
 * sign-out, and a credential count can't tell a new user from one adding a
 * passkey.
 */
export async function announceSignIn(
  ctx: AppContext,
  user: User,
  signIn: ActionArgs<"user:signed_in">[1],
): Promise<void> {
  await ctx.hooks.doAction("user:signed_in", user, signIn, ctx);
}
