import { buildSessionCookie, isSecureRequest, readSessionCookie } from "plumix";

import type { DemoDB } from "./demo-db.js";
import { DemoError } from "../errors.js";

/** Cookie holding the per-visitor demo session token. */
export const DEMO_COOKIE_NAME = "plumix_demo";

/** How long a demo sandbox lives before its Durable Object self-cleans. */
export const DEMO_TTL_SECONDS = 3600;

/** Read the demo session token from the request cookie, or null if absent. */
export function readDemoToken(request: Request): string | null {
  return readSessionCookie(request, DEMO_COOKIE_NAME);
}

/** Set-Cookie value that binds a visitor to their session for the TTL. */
export function demoSessionCookie(token: string, request: Request): string {
  return buildSessionCookie(token, {
    name: DEMO_COOKIE_NAME,
    maxAgeSeconds: DEMO_TTL_SECONDS,
    secure: isSecureRequest(request),
  });
}

/** Resolve the visitor's own DemoDB Durable Object from their session token. */
export function demoStub(
  env: unknown,
  binding: string,
  token: string,
): DurableObjectStub<DemoDB> {
  const namespaces = env as Record<
    string,
    DurableObjectNamespace<DemoDB> | undefined
  >;
  const namespace = namespaces[binding];
  if (!namespace) {
    throw DemoError.bindingMissing({ binding });
  }
  return namespace.get(namespace.idFromName(token));
}
