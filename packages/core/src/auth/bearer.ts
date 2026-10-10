import type { AppContext } from "../context/app-context.js";
import {
  apiTokenAuthenticator,
  authenticateTraced,
  tokenScopesOf,
} from "./authenticator.js";
import { withUser } from "./with-user.js";

// Not the configured authenticator: these endpoints sit ahead of the CSRF gate,
// and only bearer auth is CSRF-immune.
const bearerAuthenticator = apiTokenAuthenticator();

// Must stay a superset of what `apiTokenAuthenticator` parses, so an
// unparseable header fails closed to 401, not anonymous.
const BEARER = /^bearer\s+\S/i;

export function hasBearerToken(request: Request): boolean {
  return BEARER.test(request.headers.get("authorization") ?? "");
}

export async function authenticateBearer(
  ctx: AppContext,
): Promise<AppContext | null> {
  const result = await authenticateTraced(ctx, bearerAuthenticator);
  if (!result) return null;
  const { id, email, role, meta } = result.user;
  return withUser(ctx, { id, email, role, meta }, tokenScopesOf(result));
}
