import type { ThemeTokens } from "./types.js";

export type TokenCategory = keyof ThemeTokens;

export type BlockStyleBucket = Readonly<Record<string, string>>;

export interface BlockStyleSlot {
  readonly large?: BlockStyleBucket;
  readonly medium?: BlockStyleBucket;
  readonly small?: BlockStyleBucket;
}

const PROPERTY_TO_CATEGORY: Readonly<Record<string, TokenCategory>> = {
  padding: "spacing",
  margin: "spacing",
  gap: "spacing",
  background: "colors",
  color: "colors",
  borderColor: "colors",
  fontSize: "typography",
  fontFamily: "typography",
};

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
  style: BlockStyleSlot | undefined,
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
  bucket: BlockStyleBucket,
  tokens: ThemeTokens,
): string {
  const decls: string[] = [];
  for (const [property, tokenId] of Object.entries(bucket)) {
    const category = PROPERTY_TO_CATEGORY[property];
    const value = category
      ? tokenIdToCssVar(tokenId, category, tokens)
      : tokenId;
    decls.push(`${propertyToCss(property)}: ${value};`);
  }
  return decls.join(" ");
}

function propertyToCss(property: string): string {
  return property.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function categoryToSegment(category: TokenCategory): string {
  return category === "colors" ? "color" : category;
}
