import type {
  ResolvedThemeTokens,
  ThemeTokens,
  TokenCategory,
} from "./types.js";
import { sanitizeCssValue } from "./sanitize-css.js";

/**
 * Token vs. literal is not a stored distinction: a token is just a `var()`
 * string built by {@link tokenIdToCssVar}.
 */
export type ResponsiveStyleBucket = Readonly<Record<string, string>>;

/** Coerce a stored bucket value to a usable CSS value string, or `null` when
 *  it's empty or not a string. */
export function normalizeStyleValue(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export type ResponsiveStyleSlot = Readonly<{
  large?: ResponsiveStyleBucket;
  medium?: ResponsiveStyleBucket;
  small?: ResponsiveStyleBucket;
}>;

/** Kept out of the style slot so hiding never clobbers a bucket's layout
 *  `display`; clearing a flag restores it. */
export type VisibilityFlags = Readonly<{
  large?: boolean;
  medium?: boolean;
  small?: boolean;
}>;

/**
 * Which token category a property reads from. `spacing` and `color` are the
 * two cross-property buckets; every other property reads its own same-named
 * scale (fontSize → fontSize, not the font-family bucket).
 */
const PROPERTY_TO_CATEGORY: Readonly<Record<string, TokenCategory>> = {
  padding: "spacing",
  paddingTop: "spacing",
  paddingRight: "spacing",
  paddingBottom: "spacing",
  paddingLeft: "spacing",
  margin: "spacing",
  marginTop: "spacing",
  marginRight: "spacing",
  marginBottom: "spacing",
  marginLeft: "spacing",
  gap: "spacing",
  background: "color",
  color: "color",
  borderColor: "color",
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  borderWidth: "borderWidth",
  borderRadius: "borderRadius",
  boxShadow: "boxShadow",
  textShadow: "textShadow",
  backgroundImage: "backgroundImage",
  maxWidth: "maxWidth",
};

/** `undefined` for a property with no token scale. */
export function tokenCategoryForProperty(
  property: string,
): TokenCategory | undefined {
  return PROPERTY_TO_CATEGORY[property];
}

const SAFE_CSS_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

export const VIEWPORT_MAX_PX: Readonly<Record<"medium" | "small", number>> = {
  medium: 991,
  small: 640,
};

/**
 * Max-width in px: `tablet` gates the medium bucket, `mobile` the small bucket.
 */
export interface ThemeBreakpoints {
  readonly tablet: number;
  readonly mobile: number;
}

export const DEFAULT_BREAKPOINTS: ThemeBreakpoints = {
  tablet: VIEWPORT_MAX_PX.medium,
  mobile: VIEWPORT_MAX_PX.small,
};

/** Falls back to the token's registered literal so it renders before a theme
 *  defines the variable. */
export function tokenIdToCssVar(
  id: string,
  category: TokenCategory,
  tokens: ThemeTokens,
): string {
  const entry = tokens[category]?.[id];
  if (entry?.value !== undefined) {
    return `var(--plumix-${categoryToSegment(category)}-${id}, ${entry.value})`;
  }
  return tokenCssVar(id, category);
}

/** The bare CSS variable reference for a token — `var(--plumix-color-primary)`,
 *  no resolved fallback. */
export function tokenCssVar(id: string, category: TokenCategory): string {
  return `var(--plumix-${categoryToSegment(category)}-${id})`;
}

/** Inverse of {@link tokenIdToCssVar}; `null` for a literal or a different
 *  category. */
export function tokenIdFromCssVar(
  value: string,
  category: TokenCategory,
): string | null {
  const prefix = `var(--plumix-${categoryToSegment(category)}-`;
  if (!value.startsWith(prefix)) return null;
  const id = /^[A-Za-z0-9_-]+/.exec(value.slice(prefix.length))?.[0];
  return id ?? null;
}

/**
 * Drops tokens without a `value` and any unsafe name or value, since a
 * descriptor can reach the runtime without passing `defineTheme`.
 */
export function resolveThemeTokens(tokens: ThemeTokens): ResolvedThemeTokens {
  // `SAFE_CSS_TOKEN_RE` admits `__proto__`; on a plain object those tokens
  // would be written onto `Object.prototype` for the whole isolate.
  const resolved = Object.create(null) as Record<
    string,
    Record<string, string>
  >;
  for (const [category, group] of Object.entries(tokens)) {
    if (!SAFE_CSS_TOKEN_RE.test(category)) continue;
    for (const [slug, entry] of Object.entries(group ?? {})) {
      if (!SAFE_CSS_TOKEN_RE.test(slug) || entry.value === undefined) continue;
      const value = sanitizeCssValue(entry.value);
      if (value === null) continue;
      (resolved[category] ??= Object.create(null) as Record<string, string>)[
        slug
      ] = value;
    }
  }
  return resolved;
}

/**
 * For stylesheets rendered away from the page, where the theme's CSS never
 * loads, so their `var()` references resolve.
 */
export function emitThemeTokenCss(tokens: ThemeTokens): string {
  const declarations = Object.entries(resolveThemeTokens(tokens)).flatMap(
    ([category, group]) =>
      Object.entries(group ?? {}).map(
        ([slug, value]) =>
          `--plumix-${categoryToSegment(category)}-${slug}: ${value};`,
      ),
  );
  return declarations.length === 0 ? "" : `:root { ${declarations.join(" ")} }`;
}

export function emitBlockStyleCss(
  className: string,
  style: ResponsiveStyleSlot | undefined,
  breakpoints: ThemeBreakpoints = DEFAULT_BREAKPOINTS,
  hidden?: VisibilityFlags,
): string {
  if (!style && !hidden) return "";
  const maxWidth: Readonly<Record<"medium" | "small", number>> = {
    medium: breakpoints.tablet,
    small: breakpoints.mobile,
  };
  const parts: string[] = [];
  const largeDecls = bucketToDeclarations(
    effectiveBucket(style?.large, hidden?.large),
  );
  if (largeDecls) parts.push(`.${className} { ${largeDecls} }`);
  for (const viewport of ["medium", "small"] as const) {
    const decls = bucketToDeclarations(
      effectiveBucket(style?.[viewport], hidden?.[viewport]),
    );
    if (decls)
      parts.push(
        `@media (max-width: ${String(maxWidth[viewport])}px) { .${className} { ${decls} } }`,
      );
  }
  return parts.join(" ");
}

/**
 * A device's emitted declarations: its stored bucket, with `display: none`
 * forced on top when the device is hidden (visibility overrides layout, and the
 * spread keeps `display` last so it wins).
 */
function effectiveBucket(
  bucket: ResponsiveStyleBucket | undefined,
  hide: boolean | undefined,
): ResponsiveStyleBucket {
  return hide ? { ...bucket, display: "none" } : (bucket ?? {});
}

function bucketToDeclarations(bucket: ResponsiveStyleBucket): string {
  const decls: string[] = [];
  for (const [property, stored] of Object.entries(bucket)) {
    if (!SAFE_CSS_TOKEN_RE.test(property)) continue;
    const value = normalizeStyleValue(stored);
    if (value === null) continue;
    const css = sanitizeCssValue(value);
    if (css === null) continue;
    decls.push(`${propertyToCss(property)}: ${css};`);
  }
  return decls.join(" ");
}

const kebabCase = (s: string): string =>
  s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function propertyToCss(property: string): string {
  // CSS custom properties are case-sensitive (`--brandColor` ≠
  // `--brand-color`), so pass them through verbatim; only camelCase standard
  // props get kebab-cased.
  if (property.startsWith("--")) return property;
  return kebabCase(property);
}

/**
 * The CSS-var segment for a category is its kebab-cased key, so the var is
 * always `--plumix-<kebab(category)>-<slug>` — one rule, no per-category cases.
 */
function categoryToSegment(category: TokenCategory): string {
  return kebabCase(category);
}
