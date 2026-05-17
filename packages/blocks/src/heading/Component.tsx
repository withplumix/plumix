import type { ReactElement } from "react";
import { createElement } from "react";

import type { BlockStyleSlot } from "../styles/types.js";
import type { BlockProps } from "../types.js";
import { blockElementProps, useBlockStyles } from "../styles/hooks.js";
import { headingSupports } from "./supports.js";

const DEFAULT_LEVEL = 2;

/**
 * Clamps and integer-coerces an author-supplied level. Mirrors the
 * defensive walker that `@plumix/core`'s legacy renderer uses — content
 * stored with malformed levels (legacy imports, hand-edited JSON) still
 * renders sensibly instead of producing `<hNaN>`.
 */
function clampHeadingLevel(raw: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_LEVEL;
  const truncated = Math.trunc(raw);
  if (truncated < 1) return 1;
  if (truncated > 6) return 6;
  return truncated as 1 | 2 | 3 | 4 | 5 | 6;
}

export function HeadingComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const level = clampHeadingLevel(attrs.level);
  const slot = (attrs.style ?? {}) as BlockStyleSlot;
  const resolved = useBlockStyles(slot, headingSupports);
  return createElement(`h${level}`, blockElementProps(resolved), children);
}
