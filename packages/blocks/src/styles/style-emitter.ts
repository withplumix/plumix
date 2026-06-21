import type { ThemeTokens } from "./types.js";
import { sanitizeCssValue } from "./sanitize-css.js";

export type TokenCategory = keyof ThemeTokens;

/**
 * One declaration's value: a theme `token` (resolved to a CSS variable, so it
 * reskins when the token changes) or a `raw` literal (sanitized, fixed). A
 * legacy bare-string value is read as a token ref — that's the migration, done
 * lazily at emit time with no stored-data rewrite.
 */
export type StyleValue = { readonly token: string } | { readonly raw: string };

export type ResponsiveStyleBucket = Readonly<
  Record<string, StyleValue | string>
>;

/** Coerce a stored bucket value (possibly the legacy bare-string token id) to a
 *  `StyleValue`, or `null` when it's malformed. */
export function normalizeStyleValue(value: unknown): StyleValue | null {
  if (typeof value === "string") return value === "" ? null : { token: value };
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const hasToken = typeof v.token === "string";
  const hasRaw = typeof v.raw === "string";
  // Exactly one of token | raw — never both, never neither.
  if (hasToken === hasRaw) return null;
  return hasToken ? { token: v.token as string } : { raw: v.raw as string };
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

export function tokenIdToCssVar(
  id: string,
  category: TokenCategory,
  tokens: ThemeTokens,
): string {
  const cssVar = `--plumix-${categoryToSegment(category)}-${id}`;
  const entry = tokens[category]?.[id];
  if (entry?.value !== undefined) {
    return `var(${cssVar}, ${entry.value})`;
  }
  return `var(${cssVar})`;
}

export function emitBlockStyleCss(
  className: string,
  style: ResponsiveStyleSlot | undefined,
  tokens: ThemeTokens,
  breakpoints: ThemeBreakpoints = DEFAULT_BREAKPOINTS,
): string {
  if (!style) return "";
  const maxWidth: Readonly<Record<"medium" | "small", number>> = {
    medium: breakpoints.tablet,
    small: breakpoints.mobile,
  };
  const parts: string[] = [];
  if (style.large) {
    const decls = bucketToDeclarations(style.large, tokens);
    if (decls) parts.push(`.${className} { ${decls} }`);
  }
  for (const viewport of ["medium", "small"] as const) {
    const bucket = style[viewport];
    if (!bucket) continue;
    const decls = bucketToDeclarations(bucket, tokens);
    if (decls)
      parts.push(
        `@media (max-width: ${String(maxWidth[viewport])}px) { .${className} { ${decls} } }`,
      );
  }
  return parts.join(" ");
}

function bucketToDeclarations(
  bucket: ResponsiveStyleBucket,
  tokens: ThemeTokens,
): string {
  const decls: string[] = [];
  for (const [property, stored] of Object.entries(bucket)) {
    if (!SAFE_CSS_TOKEN_RE.test(property)) continue;
    const value = normalizeStyleValue(stored);
    if (!value) continue;
    const css = declarationValue(property, value, tokens);
    if (css === null) continue;
    decls.push(`${propertyToCss(property)}: ${css};`);
  }
  return decls.join(" ");
}

// Resolve one declaration's right-hand side: a token → its CSS variable (with
// the registered literal as fallback), a raw value → the sanitized literal.
// Returns null to drop the declaration (unknown token category, unsafe token
// id, or a raw value carrying an injection vector).
function declarationValue(
  property: string,
  value: StyleValue,
  tokens: ThemeTokens,
): string | null {
  if ("raw" in value) return sanitizeCssValue(value.raw);
  if (!SAFE_CSS_TOKEN_RE.test(value.token)) return null;
  const category = PROPERTY_TO_CATEGORY[property];
  if (!category) return null;
  return tokenIdToCssVar(value.token, category, tokens);
}

function propertyToCss(property: string): string {
  return property.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function categoryToSegment(category: TokenCategory): string {
  return category === "colors" ? "color" : category;
}
