import type { AppContext } from "../context/app-context.js";
import {
  apiTokenOf,
  audienceTokenAuthenticator,
  authenticateTraced,
  tokenScopesOf,
} from "./authenticator.js";
import { withUser } from "./with-user.js";

/**
 * Must stay a superset of what `apiTokenAuthenticator` parses, so an
 * unparseable header fails closed to 401, not anonymous.
 */
const BEARER = /^bearer\s+\S/i;

export function hasBearerToken(request: Request): boolean {
  return BEARER.test(request.headers.get("authorization") ?? "");
}

/**
 * Not the configured authenticator: these endpoints sit ahead of the CSRF gate,
 * and only bearer auth is CSRF-immune. A token bound to an audience passes only
 * where `audience` names it.
 */
export async function authenticateBearer(
  ctx: AppContext,
  audience: string | null = null,
): Promise<AppContext | null> {
  const result = await authenticateTraced(
    ctx,
    audienceTokenAuthenticator(audience),
  );
  if (!result) return null;
  const { id, email, role, meta } = result.user;
  return withUser(
    ctx,
    { id, email, role, meta },
    tokenScopesOf(result),
    apiTokenOf(result),
  );
}
