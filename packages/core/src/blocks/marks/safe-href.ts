/** A site-wide extension, if ever added, is one setting every consumer reads (WordPress #18268). */
export const LINK_SCHEMES: readonly string[] = Object.freeze([
  "http",
  "https",
  "mailto",
  "tel",
  "sms",
]);

/**
 * Never allowed, whatever an override declares. `view-source` is listed
 * because sanitize-html keeps `view-source:javascript:` hrefs that DOMPurify
 * rejects.
 */
export const BLOCKED_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "vbscript",
  "data",
  "blob",
  "view-source",
  "file",
]);

/** Root-, fragment-, query- or dot-relative refs. */
const RELATIVE_REF = String.raw`\/|#|\?|\.\.?\/`;

/**
 * Hrefs a link may carry: one of `schemes` above the `BLOCKED_SCHEMES` floor,
 * or a relative ref. Every other scheme and its case variants fail.
 */
export function linkHrefPattern(schemes: readonly string[]): RegExp {
  const allowed = schemes
    .map((scheme) => scheme.toLowerCase())
    .filter((scheme) => !BLOCKED_SCHEMES.has(scheme))
    .map((scheme) => `${scheme}:`);
  return new RegExp(`^(${[...allowed, RELATIVE_REF].join("|")})`, "i");
}

export const SAFE_HREF = linkHrefPattern(LINK_SCHEMES);

/** The trimmed href when it is safe, else `undefined`. */
export function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}
