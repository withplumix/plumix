import type { AppContext } from "../context/app.js";
import type { User } from "../db/schema/users.js";
import type { ActionArgs } from "../hooks/types.js";
import type { PlumixApp } from "../runtime/app.js";
import { withBasePath } from "../base-path.js";
import { buildSessionCookie, isSecureRequest } from "./cookies.js";
import { createSession, readClientMeta } from "./sessions.js";

interface MintedSession {
  /** Raw session token — same value the cookie carries. */
  readonly token: string;
  /** Ready-to-set `Set-Cookie` header value. */
  readonly cookieHeader: string;
}

/**
 * Compose the four steps every successful sign-in shares: read request
 * meta, create the session row, derive the secure-context flag, and
 * build the `Set-Cookie` header from the configured `sessionPolicy`.
 *
 * Every auth flow that mints a session for the user (magic-link, oauth,
 * passkey register/login/invite-accept) calls this — cookie attribute
 * policy lives here so a change to `SameSite`, `Secure`, or `Max-Age`
 * applies uniformly without scanning five call sites.
 */
export async function mintSessionAndCookie(
  ctx: AppContext,
  app: PlumixApp,
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
    path: withBasePath("/", app.basePath),
  });
  return { token, cookieHeader };
}

/**
 * The one place `user:signed_in` fires for the built-in flows. Each flow
 * takes `firstSignIn` from its own ceremony, never from stored rows:
 * sessions are deleted on sign-out, and a credential count can't tell a
 * new user from an existing one adding their first passkey.
 */
export async function announceSignIn(
  ctx: AppContext,
  user: User,
  signIn: ActionArgs<"user:signed_in">[1],
): Promise<void> {
  await ctx.hooks.doAction("user:signed_in", user, signIn, ctx);
}
