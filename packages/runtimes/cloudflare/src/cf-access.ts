import { createRemoteJWKSet, jwtVerify } from "jose";

import type { Db, RequestAuthenticator, User, UserRole } from "@plumix/core";
import { ExternalIdentityError, resolveExternalIdentity } from "@plumix/core";

// Header CF Access sets on every request that passed the application's
// policy. Documented in `https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/`.
const CF_ACCESS_HEADER = "cf-access-jwt-assertion";

// CF's logout endpoint clears both the global session cookie and the
// per-application session. The plumix logout handler should redirect
// here when the cfAccess() guard is in use; documented in
// `https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/`.
const CF_ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

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
   * admin (atomic CASE-WHEN-COUNT in `provisionUser`). Default false:
   * pair with `auth.bootstrapVia: 'first-method-wins'` if you want CF
   * Access to mint the first admin instead of the passkey rail.
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
 */
export function cfAccess(config: CfAccessConfig): RequestAuthenticator {
  const issuer = `https://${config.teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`/cdn-cgi/access/certs`, issuer));
  return {
    signOutUrl(): string {
      return cfAccessLogoutUrl(config.teamDomain);
    },
    async authenticate(request: Request, db: Db): Promise<User | null> {
      const token = request.headers.get(CF_ACCESS_HEADER);
      if (!token) return null;

      let payload;
      try {
        const result = await jwtVerify(token, jwks, {
          issuer,
          audience: config.audience,
        });
        payload = result.payload;
      } catch {
        // Bad signature, expired, wrong issuer/audience. Treat as
        // unauthenticated — the dispatcher will 401 protected routes.
        return null;
      }

      const email = extractEmail(payload);
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
        return user;
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
