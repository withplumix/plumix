const SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/;
// What a URLPattern pathname reads as more than a literal character.
const PATTERN_SYNTAX_RE = /[*:(){}?+]/;

/**
 * What is wrong with a URL base — a `rewrite.slug` or a string `hasArchive` —
 * as a clause the boot error quotes, or null when it is one or more
 * lowercase kebab-case segments joined by `/`. The caller decides whether
 * `""` is allowed before asking.
 */
export function baseSlugProblem(slug: string): string | null {
  if (slug === "") return "it is empty";
  const trimmed = slug.replace(/^\/+|\/+$/g, "");
  if (trimmed !== slug && trimmed !== "" && baseSlugProblem(trimmed) === null) {
    const leading = slug.startsWith("/");
    const trailing = slug.endsWith("/");
    const which =
      leading && trailing
        ? "leading and trailing slashes"
        : leading
          ? "leading slash"
          : "trailing slash";
    return `drop the ${which} and write "${trimmed}"`;
  }
  for (const segment of slug.split("/")) {
    if (SEGMENT_RE.test(segment)) continue;
    if (segment === "") {
      return `it has an empty segment; join segments with a single "/"`;
    }
    if (segment === "." || segment === "..") {
      return `segment "${segment}" is a relative path segment, which a URL base cannot hold`;
    }
    if (PATTERN_SYNTAX_RE.test(segment)) {
      return (
        `segment "${segment}" is URL-pattern syntax, which would compile ` +
        `into a rule matching other URLs`
      );
    }
    return (
      `segment "${segment}" is not lowercase kebab-case ` +
      `(a-z, 0-9 and "-", not starting with "-")`
    );
  }
  return null;
}
