import type { ThemeTokens } from "./types.js";

export type TokenCategory = keyof ThemeTokens;

export type ResponsiveStyleBucket = Readonly<Record<string, string>>;

export interface ResponsiveStyleSlot {
  readonly large?: ResponsiveStyleBucket;
  readonly medium?: ResponsiveStyleBucket;
  readonly small?: ResponsiveStyleBucket;
}

const PROPERTY_TO_CATEGORY: Readonly<Record<string, TokenCategory>> = {
  padding: "spacing",
  margin: "spacing",
  gap: "spacing",
  background: "colors",
  color: "colors",
  fontSize: "typography",
  fontFamily: "typography",
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
  for (const [property, tokenId] of Object.entries(bucket)) {
    if (!SAFE_CSS_TOKEN_RE.test(property) || !SAFE_CSS_TOKEN_RE.test(tokenId)) {
      continue;
    }
    const category = PROPERTY_TO_CATEGORY[property];
    if (!category) continue;
    decls.push(
      `${propertyToCss(property)}: ${tokenIdToCssVar(tokenId, category, tokens)};`,
    );
  }
  return decls.join(" ");
}

function propertyToCss(property: string): string {
  return property.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function categoryToSegment(category: TokenCategory): string {
  return category === "colors" ? "color" : category;
}
