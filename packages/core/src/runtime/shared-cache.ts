import type { RequestAuthenticator } from "../context/authenticator.js";
import { requestHasSession } from "../auth/authenticator.js";
import { stripBasePath } from "../base-path.js";
import {
  methodIsCacheable,
  requestCarriesEphemeralGrant,
  requestIsPrivileged,
} from "../cdn/decision.js";
import { isPlatformPath } from "../route/public-routes.js";

/** What the predicate reads of a built app. */
export interface SharedCacheSite {
  readonly authenticator: RequestAuthenticator;
  readonly config: { readonly basePath: string };
}

/**
 * Whether a CDN in front of the app may answer `request` from its shared copy.
 * Anything with a session, credential or grant, or on core's paths, runs live.
 */
export function mayServeFromSharedCache(
  site: SharedCacheSite,
  request: Request,
): boolean {
  if (!methodIsCacheable(request.method)) return false;
  const hasSession = requestHasSession(site.authenticator, request);
  if (requestIsPrivileged(request, hasSession)) return false;
  if (requestCarriesEphemeralGrant(request)) return false;
  const rooted = stripBasePath(
    new URL(request.url).pathname,
    site.config.basePath,
  );
  return rooted === null || !isPlatformPath(rooted);
}
