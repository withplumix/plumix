import type { AdminArea } from "plumix";

/**
 * Each refused path is filed under the admin area whose surfaces offer it, so
 * the areas the demo declares to the admin can't drift from what the gate
 * refuses.
 */
const REFUSED_PREFIXES = {
  // An API token authenticates from anywhere.
  apiTokens: ["/_plumix/rpc/auth/apiTokens/"],
  // Approving a device mints an API token for it.
  deviceAuthorization: [
    "/_plumix/rpc/auth/deviceFlow/",
    "/_plumix/auth/device/",
  ],
  // Registering a passkey creates a credential; signing in with one mints a
  // session.
  passkeys: ["/_plumix/rpc/auth/credentials/", "/_plumix/auth/passkey/"],
  // The callback links a provider account and mints a session.
  oauthLinking: ["/_plumix/auth/oauth/"],
  // Each sends a real email, or redeems a link one carried.
  emailDelivery: [
    "/_plumix/rpc/user/invite",
    "/_plumix/auth/invite/",
    "/_plumix/auth/magic-link/",
    "/_plumix/rpc/user/requestEmailChange",
    "/_plumix/auth/verify-email",
    "/_plumix/rpc/auth/mailer/",
  ],
} as const satisfies Record<AdminArea, readonly string[]>;

/** The admin areas the demo deployment refuses. */
export const DEMO_REFUSED_AREAS = Object.keys(
  REFUSED_PREFIXES,
) as readonly AdminArea[];

const PREFIXES: readonly string[] = Object.values(REFUSED_PREFIXES).flat();

/**
 * Refuses only what reaches past the visitor's sandbox: a credential usable
 * outside their tab, or a real email. Path-only, so every method is refused.
 */
export function isBlockedInDemo(pathname: string): boolean {
  return PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
