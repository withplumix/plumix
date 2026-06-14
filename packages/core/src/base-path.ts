/**
 * Base-path algebra for serving a plumix site under a subdirectory
 * (`example.com/custom-directory/*`). Three pure helpers mirror the model
 * the major frameworks settled on: normalize once at config load, strip once
 * on the inbound request before routing, prepend on every outbound URL.
 *
 * The empty string is the root deployment (today's behavior) and every helper
 * treats it as a no-op, so an unconfigured site is byte-for-byte unchanged.
 */

/**
 * Canonicalize an operator-supplied base path: `""` for a root deployment,
 * otherwise a leading-slash, no-trailing-slash, single-slash-separated prefix.
 * Lenient by design (`docs`, `/docs/`, `/a//b` all normalize) so a small
 * config typo doesn't 404 the whole site.
 */
export function normalizeBasePath(input: string | undefined): string {
  if (input === undefined) return "";
  const segments = input.split("/").filter((part) => part.trim().length > 0);
  if (segments.length === 0) return "";
  return "/" + segments.map((part) => part.trim()).join("/");
}

/**
 * Remove the base prefix from an inbound pathname so the rest of the router
 * matches against root-relative paths unchanged. Returns the remainder (always
 * leading-slash; the bare base maps to `/`) or `null` when the request isn't
 * under the base, which the caller turns into a 404.
 *
 * A root base (`""`) is a pure pass-through — the path is returned verbatim so
 * an unconfigured deployment behaves exactly as before. When a base IS set,
 * duplicate leading slashes are collapsed first so `//docs/admin` can't dodge
 * the prefix gate (matching the hardening the SSR frameworks apply).
 */
export function stripBasePath(
  pathname: string,
  basePath: string,
): string | null {
  if (basePath === "") return pathname;
  const collapsed = pathname.replace(/^\/+/, "/");
  if (collapsed === basePath) return "/";
  if (collapsed.startsWith(`${basePath}/`)) {
    return collapsed.slice(basePath.length);
  }
  return null;
}

/**
 * Prepend the base to a root-relative path for an outbound URL (canonical tag,
 * sitemap `<loc>`, feed link, permalink, cookie `Path`). Inverse of
 * {@link stripBasePath}: the site root (`/`) maps back to the bare base, and a
 * root base (`""`) returns the path untouched.
 */
export function withBasePath(path: string, basePath: string): string {
  if (basePath === "") return path;
  return path === "/" ? basePath : `${basePath}${path}`;
}
