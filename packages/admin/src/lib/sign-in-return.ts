import { ADMIN_BASE_PATH } from "./constants.js";

/**
 * An admin path to go back to once signed in, or the dashboard. Only a path on
 * this admin: a sign-in link must not send the person to another site.
 */
export function signInReturnPath(next: string | undefined): string {
  if (!next?.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/**
 * The same page for a sign-in that finishes on the server (a magic link, an
 * OAuth provider), as the site path `redirectTo` takes. `undefined` leaves the
 * server's default, the dashboard.
 */
export function signInRedirectTo(next: string | undefined): string | undefined {
  if (next === undefined) return undefined;
  return `${ADMIN_BASE_PATH}${signInReturnPath(next)}`;
}
