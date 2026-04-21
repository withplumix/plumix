/**
 * URL-slug derivation for the post editor's auto-slug behavior. The core
 * `deriveAdminSlug` handles the same shape for post-type manifest entries
 * but lives inside a drizzle-importing module — keeping a small copy here
 * avoids pulling drizzle into the admin bundle. Matches core's algorithm:
 * lowercase ASCII alphanumerics separated by single dashes, leading/
 * trailing dashes stripped, non-ASCII collapses to dashes.
 *
 * Produces an empty string for all-non-ASCII input — the form validates
 * `slug: minLength(1)` so the editor surfaces the error rather than the
 * RPC rejecting.
 */
export function slugify(input: string): string {
  const lower = input.toLowerCase();
  let result = "";
  let pendingDash = false;
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const isAlphaNum =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      if (pendingDash && result.length > 0) result += "-";
      result += lower[i];
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return result;
}
