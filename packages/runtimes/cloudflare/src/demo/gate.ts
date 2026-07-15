/**
 * Demo-mode route gate. The demo allows the full editing surface — content,
 * taxonomies, settings, search, media picker reads — but blocks routes that
 * are security-sensitive or abuse-prone in an anonymous, no-real-auth sandbox:
 * real auth flows, auth/token/session management, user management, and media
 * uploads. Pure and path-only (any blocked path is blocked for every method;
 * RPC procedures are addressed by URL after the `/_plumix/rpc/` prefix).
 */

/** Allowed even though a blocked prefix would otherwise catch them. */
const ALLOWED = new Set([
  // The admin's boot probe (current user / needs-bootstrap).
  "/_plumix/rpc/auth/session",
  // Media picker reads and DB-only metadata edits (title/alt). These touch
  // only the per-session database, never the shared storage bucket.
  "/_plumix/rpc/media/list",
  "/_plumix/rpc/media/update",
]);

const BLOCKED_PREFIXES = [
  // Real auth flows: passkey, magic-link, OAuth, invite, device, signout.
  "/_plumix/auth/",
  // Auth management RPCs: API tokens, sessions, credentials, mailer, domains.
  "/_plumix/rpc/auth/",
  // User management RPCs: invite, create, delete, disable, update.
  "/_plumix/rpc/user/",
  // Media, fail-closed: storage is a *shared* bucket (not per-session), so
  // every write that touches it — upload, confirm, delete — is blocked, and
  // only the reads/DB-only edits above are allowlisted. New media procedures
  // stay blocked until explicitly allowed.
  "/_plumix/media/upload/",
  "/_plumix/rpc/media/",
];

export function isBlockedInDemo(pathname: string): boolean {
  if (ALLOWED.has(pathname)) return false;
  return BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
