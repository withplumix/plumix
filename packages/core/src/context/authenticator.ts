import type { User } from "../db/schema/users.js";
import type { JsonObject } from "../json.js";
import type { Db } from "./app-context.js";

// Declared beside the context rather than in `auth/contract/`: it names `Db`,
// and a contract under `auth/` importing `context/` while the context names
// the authenticator would tie the two subsystems into a cycle.
/**
 * Resolved auth on a request — the user, the kind of credential that
 * resolved them, and any authenticator-specific narrowing of capabilities.
 * Returned by `RequestAuthenticator`s.
 *
 * `credential` is required, so an authenticator has to say what it resolved:
 *   - `"session"` → a credential binding a browser to the user: Plumix's own
 *     session cookie, or an IdP assertion such as Cloudflare Access. The
 *     user's role caps apply verbatim.
 *   - `"api-token"` → a credential that carries its own scopes. A surface that
 *     creates a credential or a session treats it as anonymous (ADR 0024).
 *
 * `tokenScopes` exists only on `"api-token"`:
 *   - `null` → unrestricted, the user's role caps apply verbatim.
 *   - `readonly string[]` → capability whitelist. The effective caps
 *     are `tokenScopes ∩ roleCaps`, so a token can never escalate.
 *     Used by API-token auth where the operator scoped the token at
 *     mint time.
 *
 * `auth.can()` on `AppContext` is the single chokepoint that consults
 * `tokenScopes` — every capability check in core + plugins reads
 * through it, so adding an authenticator that returns scopes Just Works
 * everywhere without scattered checks.
 */
export type AuthResult =
  | { readonly user: User; readonly credential: "session" }
  | {
      readonly user: User;
      readonly credential: "api-token";
      readonly tokenScopes: readonly string[] | null;
    };

/**
 * What an authenticator is handed beside the request and database. One that
 * provisions a user stores `startingUserMeta` as the new user's meta (ADR 0026).
 */
export interface AuthenticateScope {
  readonly startingUserMeta: JsonObject;
}

/**
 * Decides who the user is on a given request — a pluggable authenticator.
 *
 * Default: read the session cookie, look up the row. Override at config
 * time with anything that maps a request to an `AuthResult` (or null):
 *
 *   - `cfAccess({ teamDomain })` from `@plumix/runtime-cloudflare` —
 *     validates the Cloudflare Access JWT header.
 *   - `apiTokenAuthenticator()` — `Authorization: Bearer …` against
 *     the hashed `api_tokens` table; surfaces per-token `scopes`.
 *   - User-shipped enterprise SSO / custom authenticators: implement this
 *     one-method interface, no plumix changes required.
 *
 * The contract is intentionally narrow:
 *   - Returns `AuthResult | null`. `null` means "no auth on this
 *     request" — the caller decides whether that's a 401 or anonymous
 *     access. A result names its `credential` kind, so a surface that
 *     creates a credential can refuse an API token.
 *   - Throws on a malformed credential (bad signature, replay, etc.)
 *     so the dispatcher can map to a typed error.
 *   - No side effects: the authenticator does NOT mint sessions or
 *     set cookies. Login flows do that. An authenticator only reads.
 */
export interface RequestAuthenticator {
  authenticate(
    request: Request,
    db: Db,
    scope: AuthenticateScope,
  ): Promise<AuthResult | null>;
  /**
   * Optional. Does this request carry a credential this authenticator would
   * resolve to a browser session? Public renders consult it to skip
   * authentication for anonymous traffic without coupling to the default
   * session cookie — a custom authenticator (demo token, Cloudflare Access JWT, …)
   * authenticates by its own signal and must be given the chance to load its
   * user, or capability-gated render decisions (e.g. the visual-editor gate)
   * silently see an anonymous request. Omit it and the default applies: the
   * standard `plumix_session` cookie is present. Returning `false` opts an
   * authenticator out of public-render authentication entirely (e.g. bearer-token API auth,
   * which is not a browser session and must not bump `lastUsedAt` on every GET).
   */
  hasSession?(request: Request): boolean;
  /**
   * Optional. Where the user should land after signing out — surfaced
   * to the admin client by `/_plumix/auth/signout` as `redirectTo`.
   * Handed the sign-out request, so an authenticator chained beside
   * others can claim only the sign-outs that carry its own credential.
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
  signOutUrl?(request: Request): string | null;
}
