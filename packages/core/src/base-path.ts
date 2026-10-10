/**
 * Lenient (`docs`, `/docs/`, `/a//b` all normalize) so a config typo doesn't
 * 404 the site.
 */
export function normalizeBasePath(input: string | undefined): string {
  if (input === undefined) return "";
  const segments = input.split("/").filter((part) => part.trim().length > 0);
  if (segments.length === 0) return "";
  return "/" + segments.map((part) => part.trim()).join("/");
}

/**
 * `null` when the request isn't under the base. With a base set, duplicate
 * leading slashes collapse first so `//docs/admin` can't dodge the gate.
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

/** The site root (`/`) maps back to the bare base. */
export function withBasePath(path: string, basePath: string): string {
  if (basePath === "") return path;
  return path === "/" ? basePath : `${basePath}${path}`;
}
