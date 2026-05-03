import type { Db } from "../context/app.js";
import type { User } from "../db/schema/users.js";
import { readSessionCookie } from "./cookies.js";
import { validateSession } from "./sessions.js";

/**
 * Decides who the user is on a given request — Laravel-style Guard.
 *
 * Default: read the session cookie, look up the row. Override at config
 * time with anything that maps a request to a user (or null):
 *
 *   - `cfAccess({ teamDomain })` from `@plumix/runtime-cloudflare` —
 *     validates the Cloudflare Access JWT header.
 *   - Future `apiToken()` — `Authorization: Bearer …` against a
 *     hashed API-token table.
 *   - User-shipped enterprise SSO / custom guards: implement this
 *     one-method interface, no plumix changes required.
 *
 * The contract is intentionally narrow:
 *   - Returns `User | null`. `null` means "no auth on this request" —
 *     the caller decides whether that's a 401 or anonymous access.
 *   - Throws on a malformed credential (bad signature, replay, etc.)
 *     so the dispatcher can map to a typed error.
 *   - No side effects: the authenticator does NOT mint sessions or
 *     set cookies. Login flows do that. A guard only reads.
 */
export interface RequestAuthenticator {
  authenticate(request: Request, db: Db): Promise<User | null>;
  /**
   * Optional. Where the user should land after signing out — surfaced
   * to the admin client by `/_plumix/auth/signout` as `redirectTo`.
   * Returning null (or omitting the method) keeps the default
   * behaviour: clear the local session cookie and let the admin
   * navigate to the login screen.
   *
   * Required for IdPs that maintain their own session (Cloudflare
   * Access, SAML SP-initiated flows) — without redirecting to the
   * IdP's logout endpoint, the next request still carries the IdP
   * cookie/JWT and the user is silently re-signed-in.
   */
  signOutUrl?(request: Request): string | null;
}

/**
 * Default authenticator — reads the `plumix_session` cookie, validates
 * the row, returns the user. Same logic the dispatcher used inline
 * before this contract existed; isolating it here makes it swappable.
 */
export function sessionAuthenticator(): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      const token = readSessionCookie(request);
      if (!token) return null;
      const validated = await validateSession(db, token);
      if (!validated) return null;
      return validated.user;
    },
  };
}
