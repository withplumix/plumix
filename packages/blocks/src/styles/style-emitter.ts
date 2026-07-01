import type { ThemeTokens } from "./types.js";
import { sanitizeCssValue } from "./sanitize-css.js";

export type TokenCategory = keyof ThemeTokens;

/**
 * A stored declaration value is a plain CSS value string — a literal
 * (`"16px"`, `"#0c2238"`) or a `var()` reference (`"var(--plumix-color-primary,
 * #0c2238)"`). Token vs. literal is not a stored distinction: a token is just a
 * `var()` string the editor's token picker builds via {@link tokenIdToCssVar}.
 * The emitter sanitizes and writes the string; the theme owns what the custom
 * property resolves to.
 */
export type ResponsiveStyleBucket = Readonly<Record<string, string>>;

/** Coerce a stored bucket value to a usable CSS value string, or `null` when
 *  it's empty or not a string. */
export function normalizeStyleValue(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export interface ResponsiveStyleSlot {
  readonly large?: ResponsiveStyleBucket;
  readonly medium?: ResponsiveStyleBucket;
  readonly small?: ResponsiveStyleBucket;
}

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
  background: "colors",
  color: "colors",
  borderColor: "colors",
  fontSize: "typography",
  fontFamily: "typography",
  fontWeight: "typography",
  lineHeight: "typography",
  letterSpacing: "typography",
  borderWidth: "border",
  borderRadius: "radius",
  boxShadow: "shadow",
};

/** The token category a property reads from (e.g. `marginTop` → `spacing`), or
 *  `undefined` for a property with no token scale. The editor uses this to offer
 *  the right token picker for a declaration. */
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
 * Theme-supplied responsive breakpoints (max-width, px): `tablet` gates the
 * medium bucket, `mobile` the small bucket. A theme overrides these; both the
 * SSR emitter and the editor canvas read the same values so preview equals
 * shipped. Defaults match the historical viewport maxima, so an unspecified
 * theme emits identical CSS.
 */
export interface ThemeBreakpoints {
  readonly tablet: number;
  readonly mobile: number;
}

export const DEFAULT_BREAKPOINTS: ThemeBreakpoints = {
  tablet: VIEWPORT_MAX_PX.medium,
  mobile: VIEWPORT_MAX_PX.small,
};

/** Build the `var()` string the editor's token picker stores when a token is
 *  selected — the CSS variable with the token's registered literal as a
 *  fallback so it renders even before a theme defines the variable. */
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

/** The inverse of {@link tokenIdToCssVar}: extract the token id from a stored
 *  `var(--plumix-<segment>-<id>…)` string for the given category, or `null`
 *  when the value is a literal or references a different category. The editor
 *  uses it to show the token picker's selection for a stored value. */
export function tokenIdFromCssVar(
  value: string,
  category: TokenCategory,
): string | null {
  const prefix = `var(--plumix-${categoryToSegment(category)}-`;
  if (!value.startsWith(prefix)) return null;
  const id = /^[A-Za-z0-9_-]+/.exec(value.slice(prefix.length))?.[0];
  return id ?? null;
}

export function emitBlockStyleCss(
  className: string,
  style: ResponsiveStyleSlot | undefined,
  breakpoints: ThemeBreakpoints = DEFAULT_BREAKPOINTS,
): string {
  if (!style) return "";
  const maxWidth: Readonly<Record<"medium" | "small", number>> = {
    medium: breakpoints.tablet,
    small: breakpoints.mobile,
  };
  const parts: string[] = [];
  if (style.large) {
    const decls = bucketToDeclarations(style.large);
    if (decls) parts.push(`.${className} { ${decls} }`);
  }
  for (const viewport of ["medium", "small"] as const) {
    const bucket = style[viewport];
    if (!bucket) continue;
    const decls = bucketToDeclarations(bucket);
    if (decls)
      parts.push(
        `@media (max-width: ${String(maxWidth[viewport])}px) { .${className} { ${decls} } }`,
      );
  }
  return parts.join(" ");
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

function propertyToCss(property: string): string {
  // CSS custom properties are case-sensitive (`--brandColor` ≠ `--brand-color`),
  // so pass them through verbatim; only camelCase standard props get kebab-cased.
  if (property.startsWith("--")) return property;
  return property.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function categoryToSegment(category: TokenCategory): string {
  return category === "colors" ? "color" : category;
}
