/**
 * Demo-mode route gate. The demo allows the full editing surface — content,
 * taxonomies, settings, search, media — but blocks routes that are
 * security-sensitive or abuse-prone in an anonymous, no-real-auth sandbox:
 * real auth flows, auth/token/session management, and user management. Pure
 * and path-only (any blocked path is blocked for every method; RPC procedures
 * are addressed by URL after the `/_plumix/rpc/` prefix).
 */

/** Allowed even though a blocked prefix would otherwise catch them. */
const ALLOWED = new Set([
  // The admin's boot probe (current user / needs-bootstrap).
  "/_plumix/rpc/auth/session",
]);

const BLOCKED_PREFIXES = [
  // Real auth flows: passkey, magic-link, OAuth, invite, device, signout.
  "/_plumix/auth/",
  // Auth management RPCs: API tokens, sessions, credentials, mailer, domains.
  "/_plumix/rpc/auth/",
  // User management RPCs: invite, create, delete, disable, update.
  "/_plumix/rpc/user/",
];

export function isBlockedInDemo(pathname: string): boolean {
  if (ALLOWED.has(pathname)) return false;
  return BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
