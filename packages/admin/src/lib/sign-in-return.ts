/**
 * An admin path to go back to once signed in, or the dashboard. Only a path on
 * this admin: a sign-in link must not send the person to another site.
 */
export function signInReturnPath(next: string | undefined): string {
  if (!next?.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
