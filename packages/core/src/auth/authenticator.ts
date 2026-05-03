import type { Db } from "../context/app.js";
import type { User } from "../db/schema/users.js";
import { validateApiToken } from "./api-tokens.js";
import { readSessionCookie } from "./cookies.js";
import { validateSession } from "./sessions.js";

/**
 * Resolved auth on a request — the user plus any guard-specific
 * narrowing of capabilities. Returned by `RequestAuthenticator`s.
 *
 * `tokenScopes`:
 *   - `undefined` / `null` → unrestricted, the user's role caps apply
 *     verbatim (session-cookie auth, IdP guards like cfAccess).
 *   - `readonly string[]` → capability whitelist. The effective caps
 *     are `tokenScopes ∩ roleCaps`, so a token can never escalate.
 *     Used by API-token auth where the operator scoped the token at
 *     mint time.
 *
 * `auth.can()` on `AppContext` is the single chokepoint that consults
 * `tokenScopes` — every capability check in core + plugins reads
 * through it, so adding a guard that returns scopes Just Works
 * everywhere without scattered checks.
 */
export interface AuthResult {
  readonly user: User;
  readonly tokenScopes?: readonly string[] | null;
}

/**
 * Decides who the user is on a given request — Laravel-style Guard.
 *
 * Default: read the session cookie, look up the row. Override at config
 * time with anything that maps a request to an `AuthResult` (or null):
 *
 *   - `cfAccess({ teamDomain })` from `@plumix/runtime-cloudflare` —
 *     validates the Cloudflare Access JWT header.
 *   - `apiTokenAuthenticator()` — `Authorization: Bearer …` against
 *     the hashed `api_tokens` table; surfaces per-token `scopes`.
 *   - User-shipped enterprise SSO / custom guards: implement this
 *     one-method interface, no plumix changes required.
 *
 * The contract is intentionally narrow:
 *   - Returns `AuthResult | null`. `null` means "no auth on this
 *     request" — the caller decides whether that's a 401 or anonymous
 *     access.
 *   - Throws on a malformed credential (bad signature, replay, etc.)
 *     so the dispatcher can map to a typed error.
 *   - No side effects: the authenticator does NOT mint sessions or
 *     set cookies. Login flows do that. A guard only reads.
 */
export interface RequestAuthenticator {
  authenticate(request: Request, db: Db): Promise<AuthResult | null>;
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
   *
   * The returned URL must be either an absolute `https://` URL or a
   * same-origin path beginning with `/`. Invalid or unsafe values are
   * silently dropped at the dispatcher boundary so a malicious
   * authenticator can't inject `javascript:` or protocol-relative
   * redirect targets into the admin client.
   */
  signOutUrl?(): string | null;
}

/**
 * Default authenticator — reads the `plumix_session` cookie, validates
 * the row, returns the user. Same logic the dispatcher used inline
 * before this contract existed; isolating it here makes it swappable.
 *
 * Returns no `tokenScopes` — a browser session inherits the full role
 * caps. PAT-style scoping doesn't apply here.
 */
export function sessionAuthenticator(): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      const token = readSessionCookie(request);
      if (!token) return null;
      const validated = await validateSession(db, token);
      if (!validated) return null;
      return { user: validated.user };
    },
  };
}

/**
 * Personal-access-token authenticator. Reads the
 * `Authorization: Bearer pl_pat_…` header, hashes it, looks up the
 * row in `api_tokens`, and bumps `lastUsedAt`. Used by CLIs / MCP
 * servers / any non-browser client.
 *
 * Composed with `sessionAuthenticator()` by default (see
 * `defaultAuthenticator()`) so a single plumix install supports both
 * cookie-authed admin browsing AND bearer-authed API access without
 * any operator config.
 */
export function apiTokenAuthenticator(): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      const header = request.headers.get("authorization");
      if (!header) return null;
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match?.[1]) return null;
      const validated = await validateApiToken(db, match[1]);
      if (!validated) return null;
      return {
        user: validated.user,
        // null = unrestricted (token inherits role caps); array =
        // narrow to that intersection. `auth.can()` enforces.
        tokenScopes: validated.token.scopes ?? null,
      };
    },
  };
}

/**
 * Compose multiple authenticators into a first-match-wins chain. The
 * first one to return a non-null user decides the request. `signOutUrl`
 * is taken from the first authenticator that exposes it — the chain is
 * a list, and the head wins when both could speak.
 *
 * Used to wire the default plumix install: the cookie-session guard
 * in front of the API-token guard, so browser requests resolve via
 * the existing path and bearer-auth API clients don't need any
 * operator config.
 */
export function chainAuthenticators(
  ...authenticators: readonly RequestAuthenticator[]
): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      for (const auth of authenticators) {
        const result = await auth.authenticate(request, db);
        if (result) return result;
      }
      return null;
    },
    signOutUrl(): string | null {
      for (const auth of authenticators) {
        const url = auth.signOutUrl?.() ?? null;
        if (url) return url;
      }
      return null;
    },
  };
}

/**
 * Out-of-the-box authenticator: cookie-session + API token. Plumix
 * uses this when `auth.authenticator` is omitted from config; the
 * existing `sessionAuthenticator()` direct usage is preserved as the
 * intentional "no API tokens" path for ops who want to disable
 * bearer-auth at the runtime level.
 */
export function defaultAuthenticator(): RequestAuthenticator {
  return chainAuthenticators(sessionAuthenticator(), apiTokenAuthenticator());
}
