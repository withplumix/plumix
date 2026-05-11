import type { Db, RequestAuthenticator, UserRole } from "plumix";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ExternalIdentityError, resolveExternalIdentity } from "plumix";

// Header CF Access sets on every request that passed the application's
// policy. Documented in `https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/`.
const CF_ACCESS_HEADER = "cf-access-jwt-assertion";

// CF's logout endpoint clears both the global session cookie and the
// per-application session. The plumix logout handler should redirect
// here when the cfAccess() guard is in use; documented in
// `https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/`.
const CF_ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

// `<team-name>.cloudflareaccess.com` — CF Access only issues team
// domains under this suffix. Validating the suffix at boot fails fast
// on typos like `https://team.cloudflareaccess.com` (would produce
// `https://https://...` after concatenation) or `team.com` (probably
// the operator's own domain mistakenly pasted instead of the team
// domain). Custom CNAME team domains aren't supported by CF Access,
// so the suffix check doesn't false-reject valid setups.
const CF_TEAM_DOMAIN_RE = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

export interface CfAccessConfig {
  /**
   * Cloudflare Access team domain — `<team-name>.cloudflareaccess.com`.
   * Used both as the JWT issuer (`iss`) and as the host for the JWKS
   * endpoint at `https://<teamDomain>/cdn-cgi/access/certs`.
   */
  readonly teamDomain: string;
  /**
   * The CF Access application's AUD tag. Found on the application's
   * Overview page in the CF Access dashboard. Validated against the
   * JWT's `aud` claim — without this check, a JWT issued for a
   * *different* app on the same team domain would be accepted.
   */
  readonly audience: string;
  /**
   * Role for users provisioned via CF Access. The CF Access JWT carries
   * email + idp claims, but no plumix role — operators decide here. To
   * differentiate further (e.g. one IdP group → admin, another →
   * editor), wrap `cfAccess()` and inspect the JWT yourself. Required.
   */
  readonly defaultRole: UserRole;
  /**
   * When true, the very first user authenticated via CF Access becomes
   * admin (atomic CASE-WHEN-COUNT in `provisionUser`). Default false.
   *
   * This flag is *independent* of `auth.bootstrapVia` — the latter
   * gates plumix's built-in flows (passkey/oauth/magic-link), this one
   * gates the CF Access guard. To open both paths to the first-admin
   * election, set `auth.bootstrapVia: 'first-method-wins'` AND pass
   * `bootstrapAllowed: true` here. To keep CF Access as the *only*
   * bootstrap path (block built-in flows entirely), leave
   * `bootstrapVia` at its default and set this to true.
   */
  readonly bootstrapAllowed?: boolean;
}

/**
 * Cloudflare Access authenticator — validates the
 * `Cf-Access-Jwt-Assertion` header against the team's JWKS, maps the
 * `email` claim to a plumix user, and provisions on first sight.
 *
 * Returns a `RequestAuthenticator` for `auth.authenticator:` in the
 * plumix config. Pair with `auth.bootstrapVia: 'first-method-wins'`
 * if CF Access is the bootstrap path; otherwise the first-admin still
 * has to enrol via passkey before CF Access starts working.
 *
 *   import { cfAccess } from "@plumix/runtime-cloudflare";
 *
 *   plumix({
 *     auth: auth({
 *       passkey: { ... },
 *       authenticator: cfAccess({
 *         teamDomain: "yourteam.cloudflareaccess.com",
 *         audience: env.CF_ACCESS_AUD,
 *         defaultRole: "editor",
 *       }),
 *       bootstrapVia: "first-method-wins",
 *     }),
 *     ...
 *   });
 *
 * `jose`'s `createRemoteJWKSet` caches the keys per isolate so the
 * JWKS round-trip happens once per cold start, not per request.
 *
 * Two operator-config notes:
 *
 *   - `allowed_domains` is *bypassed*. CF Access is the gate — its IdP
 *     policy decides who reaches plumix, and `allowedDomainsGate:
 *     false` is forwarded to `resolveExternalIdentity`. If an operator
 *     wants per-domain role decisions on top of CF Access, wrap this
 *     factory and inspect the JWT yourself.
 *
 *   - The IdP-group → role mapping is your problem. The CF Access JWT
 *     carries the user's email and the IdP claims, but no plumix role.
 *     `defaultRole` is a single operator decision applied to every CF-
 *     Access-authenticated signup; for "Admins group → admin, others →
 *     editor", clone this implementation and inspect the JWT payload
 *     before calling `resolveExternalIdentity`.
 *
 * The authenticator returns `null` when:
 *   - the header is missing (the request didn't traverse CF Access)
 *   - the JWT is malformed, expired, or signed by an unknown key
 *   - the email claim is missing or empty
 *   - the inferred user is disabled
 *
 * `null` means "no auth" to the dispatcher, which serves the standard
 * not-authenticated response. We deliberately don't 401 inside the
 * authenticator: the dispatcher already maps `null` → 401 for protected
 * routes and `null` → anonymous for public routes.
 *
 * Throws at config time if `teamDomain` or `audience` are malformed —
 * preferable to silently producing a guard that accepts every JWT
 * (empty audience disables jose's audience-equality check) or that
 * fetches JWKS from a misshapen URL.
 */
export function cfAccess(config: CfAccessConfig): RequestAuthenticator {
  validateConfig(config);
  const issuer = `https://${config.teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`/cdn-cgi/access/certs`, issuer));
  return {
    signOutUrl(): string {
      return cfAccessLogoutUrl(config.teamDomain);
    },
    async authenticate(request: Request, db: Db) {
      const token = request.headers.get(CF_ACCESS_HEADER);
      if (!token) return null;

      let email: string | null;
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: config.audience,
        });
        email = extractEmail(payload);
      } catch {
        // Bad signature, expired, wrong issuer/audience. Treat as
        // unauthenticated — the dispatcher will 401 protected routes.
        return null;
      }
      if (!email) return null;

      try {
        const { user } = await resolveExternalIdentity(db, {
          email,
          // CF Access only forwards the JWT once the IdP returned a
          // verified email, so the verified-email gate is implicitly
          // satisfied. Hard-code true so the helper's emailVerified
          // check is never the failure path here.
          emailVerified: true,
          // CF Access is the gate — the allowed_domains lookup is
          // irrelevant. Operator-supplied defaultRole decides the role.
          allowedDomainsGate: false,
          defaultRole: config.defaultRole,
          bootstrapAllowed: config.bootstrapAllowed,
        });
        // No tokenScopes — CF Access carries the user's role caps
        // unrestricted; PAT-style scoping doesn't apply here.
        return { user };
      } catch (error) {
        if (error instanceof ExternalIdentityError) {
          // `account_disabled` and `registration_closed` (when
          // bootstrapAllowed is false and zero users) → null. The
          // operator's policy is "this CF Access user shouldn't be
          // signed in"; surface that as no-auth.
          return null;
        }
        throw error;
      }
    },
  };
}

function validateConfig(config: CfAccessConfig): void {
  if (!CF_TEAM_DOMAIN_RE.test(config.teamDomain)) {
    throw new Error(
      `cfAccess: teamDomain must match "<team>.cloudflareaccess.com" — ` +
        `got "${config.teamDomain}". Strip any "https://" prefix or path; ` +
        `the helper composes the full URL.`,
    );
  }
  // Empty audience silently disables jose's audience equality check
  // (truthy guard at jwt_claims_set.js): every JWT for the team domain
  // would be accepted, including ones issued for adjacent CF Access
  // applications. Fail-fast on missing config (e.g.
  // `audience: env.CF_ACCESS_AUD ?? ""` after a missing binding).
  if (config.audience.length === 0) {
    throw new Error(
      `cfAccess: audience must be non-empty (the AUD tag from the ` +
        `application's CF Access dashboard). An empty value would ` +
        `disable per-application audience binding.`,
    );
  }
}

/**
 * Build the CF Access logout URL for a given team domain. Plumix's
 * logout handler should redirect here when `cfAccess()` is the
 * configured authenticator — without this, plumix can clear its own
 * cookie but the next request still carries the CF Access JWT and the
 * user is silently re-signed-in.
 *
 * Operators wire this into a route or use it directly in a logout
 * button's href.
 */
export function cfAccessLogoutUrl(teamDomain: string): string {
  return `https://${teamDomain}${CF_ACCESS_LOGOUT_PATH}`;
}

function extractEmail(payload: Record<string, unknown>): string | null {
  const value = payload.email;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
