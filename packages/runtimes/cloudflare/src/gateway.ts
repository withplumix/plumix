import type { SharedCacheSite } from "plumix/runtime";
import {
  mayServeFromSharedCache,
  withoutUniversalMarker,
} from "plumix/runtime";

import { sharedCacheRequest, visitorRequest } from "./shared-cache.js";

export interface Gateway {
  readonly app: SharedCacheSite;
  /** The cached entrypoint; `null` when Workers Caching is off. */
  readonly sharedCache: ((request: Request) => Promise<Response>) | null;
  /** Runs the app live, uncached. */
  readonly serve: (request: Request) => Promise<Response>;
}

/**
 * Only a visitor with no session reaches the cached copy, without cookies, so
 * one copy per URL serves them all. The app reads a signed-in reader's copy.
 */
export async function serveThroughGateway(
  request: Request,
  gateway: Gateway,
): Promise<Response> {
  const visitor = visitorRequest(request);
  const { sharedCache } = gateway;
  if (sharedCache === null || !mayServeFromSharedCache(gateway.app, visitor)) {
    return gateway.serve(visitor);
  }
  return withoutUniversalMarker(await sharedCache(sharedCacheRequest(visitor)));
}
