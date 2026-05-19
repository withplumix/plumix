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

const VIEWPORT_MAX_PX: Readonly<Record<"medium" | "small", number>> = {
  medium: 991,
  small: 640,
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
): string {
  if (!style) return "";
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
        `@media (max-width: ${VIEWPORT_MAX_PX[viewport]}px) { .${className} { ${decls} } }`,
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
