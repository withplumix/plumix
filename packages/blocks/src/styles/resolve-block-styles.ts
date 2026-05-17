import type { CSSProperties } from "react";

import type { BlockStyleSlot, BlockSupports, ThemeTokens } from "./types.js";

export interface ResolvedBlockStyles {
  readonly className: string;
  readonly style: CSSProperties;
  readonly id?: string;
}

interface TokenAxis {
  readonly enabled: (s: BlockSupports) => boolean | undefined;
  readonly value: (s: BlockStyleSlot) => string | undefined;
  readonly group: (t: ThemeTokens) => ThemeTokens[keyof ThemeTokens];
  readonly classSuffix: string;
  readonly styleProperty: string;
}

const TOKEN_AXES: readonly TokenAxis[] = [
  {
    enabled: (s) => s.color?.background,
    value: (s) => s.color?.background,
    group: (t) => t.colors,
    classSuffix: "background-color",
    styleProperty: "backgroundColor",
  },
  {
    enabled: (s) => s.color?.text,
    value: (s) => s.color?.text,
    group: (t) => t.colors,
    classSuffix: "color",
    styleProperty: "color",
  },
  {
    enabled: (s) => s.spacing?.padding,
    value: (s) => s.spacing?.padding,
    group: (t) => t.spacing,
    classSuffix: "padding",
    styleProperty: "padding",
  },
  {
    enabled: (s) => s.spacing?.margin,
    value: (s) => s.spacing?.margin,
    group: (t) => t.spacing,
    classSuffix: "margin",
    styleProperty: "margin",
  },
  {
    enabled: (s) => s.typography?.fontSize,
    value: (s) => s.typography?.fontSize,
    group: (t) => t.typography,
    classSuffix: "font-size",
    styleProperty: "fontSize",
  },
  {
    enabled: (s) => s.typography?.lineHeight,
    value: (s) => s.typography?.lineHeight,
    group: (t) => t.typography,
    classSuffix: "line-height",
    styleProperty: "lineHeight",
  },
  {
    enabled: (s) => s.typography?.fontWeight,
    value: (s) => s.typography?.fontWeight,
    group: (t) => t.typography,
    classSuffix: "font-weight",
    styleProperty: "fontWeight",
  },
  {
    enabled: (s) => s.border?.radius,
    value: (s) => s.border?.radius,
    group: (t) => t.border,
    classSuffix: "border-radius",
    styleProperty: "borderRadius",
  },
];

/**
 * Pure mapper from author-picked style values + the block's `supports`
 * declaration + the theme's tokens to a `{ className, style, id? }`
 * triple. Named-token slugs resolve to `has-<slug>-<suffix>` utility
 * classes; raw or missing-token values fall through to inline `style`
 * so a theme swap doesn't silently break stored content.
 */
export function resolveBlockStyles(
  slot: BlockStyleSlot,
  supports: BlockSupports,
  tokens: ThemeTokens,
): ResolvedBlockStyles {
  const classes: string[] = [];
  const style: Record<string, string> = {};

  for (const axis of TOKEN_AXES) {
    if (!axis.enabled(supports)) continue;
    const raw = axis.value(slot);
    if (raw === undefined) continue;
    if (axis.group(tokens)?.[raw]) {
      classes.push(`has-${raw}-${axis.classSuffix}`);
    } else {
      style[axis.styleProperty] = raw;
    }
  }

  // textAlign / align are enumerated (left|center|right|justify, wide|full):
  // emit the class directly, no token lookup.
  if (
    supports.typography?.textAlign &&
    slot.typography?.textAlign !== undefined
  ) {
    classes.push(`has-text-align-${slot.typography.textAlign}`);
  }
  if (supports.align && slot.align !== undefined) {
    classes.push(`align-${slot.align}`);
  }
  // customClassName is the explicit escape hatch — raw class appended verbatim.
  if (supports.customClassName && slot.customClassName !== undefined) {
    classes.push(slot.customClassName);
  }

  const out: { className: string; style: CSSProperties; id?: string } = {
    className: classes.join(" "),
    style,
  };
  if (supports.anchor && slot.anchor !== undefined && slot.anchor.length > 0) {
    out.id = slot.anchor;
  }
  return out;
}
