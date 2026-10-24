import type { BlockNode } from "../render-block-tree.js";
import type { ResponsiveStyleSlot } from "./style-emitter.js";
import type {
  KnownTokenCategory,
  ThemeTokens,
  TokenCategory,
} from "./types.js";
import {
  normalizeStyleValue,
  styleCategoryForProperty,
  tokenCssVar,
  tokenIdFromCssVar,
} from "./style-emitter.js";

/**
 * A style property's category: a token category, or the property itself for
 * one with no shared scale. Closed, so a misspelled category fails to compile.
 */
export type StyleCategory =
  | KnownTokenCategory
  | "width"
  | "height"
  | "minWidth"
  | "minHeight"
  | "maxHeight"
  | "opacity"
  | "display"
  | "flexDirection"
  | "justifyContent"
  | "alignItems"
  | "alignSelf"
  | "textAlign"
  | "fontStyle"
  | "textDecoration"
  | "borderStyle";

/** `true` allows custom values everywhere; an array names the categories that keep them. */
export type AllowCustomStyles = boolean | readonly StyleCategory[];

/** The theme's style rule with the tokens it is read against. */
export interface StylePolicy {
  readonly allowCustomStyles: AllowCustomStyles;
  readonly tokens: ThemeTokens;
}

/** A theme's policy; custom values everywhere when it sets none. */
export function resolveStylePolicy(theme: {
  readonly allowCustomStyles?: AllowCustomStyles;
  readonly tokens?: ThemeTokens;
}): StylePolicy {
  return {
    allowCustomStyles: theme.allowCustomStyles ?? true,
    tokens: theme.tokens ?? {},
  };
}

/**
 * The one gate for whether a category accepts custom values. With no
 * category, whether every category does.
 */
export function allowsCustomStyles(
  policy: StylePolicy,
  category?: TokenCategory,
): boolean {
  const allow: boolean | readonly string[] = policy.allowCustomStyles;
  if (typeof allow === "boolean") return allow;
  if (category === undefined) return false;
  return allow.includes(category);
}

const FLEX_ALIGNMENTS = [
  "flex-start",
  "center",
  "flex-end",
  "stretch",
] as const;

/**
 * The fixed option lists the editor offers, by property. A keyword is never a
 * custom value, whatever the policy.
 */
export const STYLE_KEYWORDS = {
  borderStyle: ["none", "solid", "dashed", "dotted", "double"],
  display: ["block", "flex", "grid"],
  flexDirection: ["row", "column"],
  justifyContent: ["flex-start", "center", "flex-end", "space-between"],
  alignItems: FLEX_ALIGNMENTS,
  alignSelf: FLEX_ALIGNMENTS,
  textAlign: ["left", "center", "right"],
  fontWeight: ["bold"],
  fontStyle: ["italic"],
  textDecoration: ["underline", "line-through"],
} as const satisfies Readonly<Record<string, readonly string[]>>;

const KEYWORDS_BY_PROPERTY: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(STYLE_KEYWORDS),
);

/**
 * Whether the policy refuses `value` on `property`: a value that is neither a
 * keyword nor a token the theme declares, in a category without custom values.
 */
export function refusesStyleValue(
  policy: StylePolicy,
  property: string,
  value: string,
): boolean {
  const category = styleCategoryForProperty(property);
  if (allowsCustomStyles(policy, category)) return false;
  if (KEYWORDS_BY_PROPERTY.get(property)?.includes(value)) return false;
  return !isDeclaredToken(value, category, policy.tokens);
}

/** `var(--plumix-<category>-<id>)` or `var(…-<id>, <fallback>)`, `<id>` declared. */
function isDeclaredToken(
  value: string,
  category: TokenCategory,
  tokens: ThemeTokens,
): boolean {
  const id = tokenIdFromCssVar(value, category);
  if (id === null || !Object.hasOwn(tokens, category)) return false;
  const group = tokens[category];
  if (!group || !Object.hasOwn(group, id)) return false;
  const afterId = value.slice(tokenCssVar(id, category).length - 1);
  if (afterId === ")") return true;
  return (
    afterId.startsWith(",") &&
    afterId.endsWith(")") &&
    balanced(afterId.slice(1, -1))
  );
}

/** So a fallback can't close the `var()` and append a value of its own. */
function balanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export type StyleBucketName = keyof ResponsiveStyleSlot;

export type ForbiddenStyle =
  | {
      readonly kind: "style";
      readonly bucket: StyleBucketName;
      readonly property: string;
      readonly value: string;
    }
  | { readonly kind: "className"; readonly value: string };

const STYLE_BUCKETS: readonly StyleBucketName[] = ["large", "medium", "small"];

/**
 * The values on `node` the policy refuses. A value equal to the block's own
 * `defaultStyles` at that breakpoint passes, since code put it there.
 */
export function forbiddenStyles(
  node: Pick<BlockNode, "style" | "className">,
  policy: StylePolicy,
  spec: { readonly defaultStyles?: ResponsiveStyleSlot } | undefined,
): readonly ForbiddenStyle[] {
  const found: ForbiddenStyle[] = [];
  for (const bucket of STYLE_BUCKETS) {
    for (const [property, stored] of Object.entries(
      node.style?.[bucket] ?? {},
    )) {
      const value = normalizeStyleValue(stored);
      if (value === null) continue;
      if (spec?.defaultStyles?.[bucket]?.[property] === value) continue;
      if (refusesStyleValue(policy, property, value)) {
        found.push({ kind: "style", bucket, property, value });
      }
    }
  }
  const { className } = node;
  if (className?.trim() && !allowsCustomStyles(policy)) {
    found.push({ kind: "className", value: className });
  }
  return found;
}
