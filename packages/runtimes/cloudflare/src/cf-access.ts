import type { JWTPayload } from "jose";
import type { RequestAuthenticator } from "plumix/auth";
import type { UserRole } from "plumix/schema";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ExternalIdentityError, resolveExternalIdentity } from "plumix/auth";

import { CfAccessError } from "./errors.js";

/**
 * Header CF Access sets on every request that passed the application's policy.
 * Documented in
 * `https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/`.
 */
const CF_ACCESS_HEADER = "cf-access-jwt-assertion";

/**
 * Cookie CF Access sets host-wide after login, carrying the same signed
 * application token. Paths the Access application doesn't cover get no header,
 * but still carry this cookie. Documented in
 * `https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/`.
 */
const CF_ACCESS_COOKIE = "CF_Authorization";

/**
 * CF's logout endpoint clears both the global session cookie and the
 * per-application session. The plumix logout handler should redirect here when
 * the cfAccess() guard is in use; documented in
 * `https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/`.
 */
const CF_ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

/**
 * CF Access issues team domains only under this suffix, so the check catches
 * pasted URLs or the operator's own domain without rejecting valid setups.
 */
const CF_TEAM_DOMAIN_RE = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

export interface CfAccessConfig {
  /**
   * Cloudflare Access team domain — `<team-name>.cloudflareaccess.com`.
   * Used both as the JWT issuer (`iss`) and as the host for the JWKS
   * endpoint at `https://<teamDomain>/cdn-cgi/access/certs`.
   */
  readonly teamDomain: string;
  /**
   * Checked against the JWT's `aud`, or a JWT for another app on the same team
   * would pass. A list accepts any entry, for separate preview/production apps.
   */
  readonly audience: string | readonly string[];
  /**
   * The CF Access JWT carries no plumix role; wrap `cfAccess()` to map IdP
   * groups to roles.
   */
  readonly defaultRole: UserRole;
  /**
   * Makes the first CF Access user admin. Independent of `auth.bootstrapVia`,
   * which gates only the built-in flows. Default false.
   */
  readonly bootstrapAllowed?: boolean;
}

/**
 * Bypasses `allowed_domains`: the Access policy is the gate. Returns `null`
 * rather than 401 on any failed check. Throws at config time on a malformed
 * `teamDomain` or empty `audience`.
 */
export function cfAccess(config: CfAccessConfig): RequestAuthenticator {
  validateConfig(config);
  const issuer = `https://${config.teamDomain}`;
  const audience = [config.audience].flat();
  const jwks = createRemoteJWKSet(new URL(`/cdn-cgi/access/certs`, issuer));
  return {
    // Only a request signed in through Access goes to the Access logout;
    // members keep their own.
    signOutUrl(request: Request): string | null {
      return readAccessToken(request) === null
        ? null
        : cfAccessLogoutUrl(config.teamDomain);
    },
    // CF Access identity rides its own header or cookie, not the session
    // cookie.
    hasSession(request: Request): boolean {
      return readAccessToken(request) !== null;
    },
    async authenticate(request, db, scope) {
      const token = readAccessToken(request);
      if (!token) return null;

      let email: string | null;
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
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
          // CF Access forwards the JWT only after the IdP returned a verified
          // email.
          emailVerified: true,
          // CF Access is the gate — the allowed_domains lookup is
          // irrelevant. Operator-supplied defaultRole decides the role.
          allowedDomainsGate: false,
          defaultRole: config.defaultRole,
          bootstrapAllowed: config.bootstrapAllowed,
          meta: scope.startingUserMeta,
        });
        // An IdP identity bound to a browser, so a session: the user's
        // role caps apply unrestricted; PAT-style scoping doesn't apply here.
        return { user, credential: "session" };
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
    throw CfAccessError.invalidTeamDomain({ teamDomain: config.teamDomain });
  }
  // An empty audience silently disables jose's audience check, accepting any
  // JWT for the team.
  const audiences = [config.audience].flat();
  if (audiences.length === 0 || audiences.some((aud) => aud.length === 0)) {
    throw CfAccessError.audienceEmpty();
  }
}

/**
 * Redirect logout here when `cfAccess()` authenticates, or the next request
 * still carries the CF Access JWT and silently signs the user back in.
 */
export function cfAccessLogoutUrl(teamDomain: string): string {
  return `https://${teamDomain}${CF_ACCESS_LOGOUT_PATH}`;
}

/**
 * The header wins even when invalid: Cloudflare says the cookie "is not
 * guaranteed to be passed".
 */
function readAccessToken(request: Request): string | null {
  return request.headers.get(CF_ACCESS_HEADER) ?? readCookie(request);
}

function readCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== CF_ACCESS_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

function extractEmail(payload: JWTPayload): string | null {
  const value = payload.email;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
