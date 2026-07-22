import type { AppContext } from "../context/app.js";
import { withUser } from "../context/app.js";
import { apiTokenAuthenticator, authenticateTraced } from "./authenticator.js";

// Bearer PAT only — shared by the CSRF-exempt external surfaces (MCP, REST).
// Deliberately NOT the request's configured authenticator (cookie/custom
// guard): cookie auth must never resolve on an endpoint mounted ahead of the
// CSRF gate, since only bearer auth is inherently CSRF-immune.
const bearerAuthenticator = apiTokenAuthenticator();

// Must stay a superset of what `apiTokenAuthenticator` actually parses, so the
// "bearer present?" check never reports false while the token still fails to
// authenticate — the gap (e.g. a multi-token header) fails closed to 401, never
// to silent anonymous access.
const BEARER = /^bearer\s+\S/i;

export function hasBearerToken(request: Request): boolean {
  return BEARER.test(request.headers.get("authorization") ?? "");
}

/**
 * Resolve a bearer PAT to an authenticated context (user + token scopes), or
 * null when the token is absent, malformed, expired, revoked, or its user is
 * disabled. Callers decide whether a null means 401 or anonymous access.
 */
export async function authenticateBearer(
  ctx: AppContext,
): Promise<AppContext | null> {
  const result = await authenticateTraced(ctx, bearerAuthenticator);
  if (!result) return null;
  const { id, email, role, meta } = result.user;
  return withUser(ctx, { id, email, role, meta }, result.tokenScopes ?? null);
}
