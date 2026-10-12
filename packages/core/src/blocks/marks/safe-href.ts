/**
 * Hrefs a link may carry: `http(s):`, `mailto:`, `tel:`, and root-, fragment-,
 * query- or dot-relative refs. `javascript:`, `data:`, `vbscript:`, `file:` and
 * their variants fail.
 */
export const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

/** The trimmed href when it is safe, else `undefined`. */
export function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}
