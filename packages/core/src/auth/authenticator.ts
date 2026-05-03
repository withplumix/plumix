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
