import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "../runtime/app.js";
import { withBasePath } from "../base-path.js";
import { buildSessionCookie, isSecureRequest } from "./cookies.js";
import { createSession, readRequestMeta } from "./sessions.js";

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
    { userId, ...readRequestMeta(ctx.request) },
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
