import type { CSSProperties } from "react";

/**
 * The `.sr-only` recipe, inline. Hides an element from sight while keeping it
 * in the accessibility tree and in the tab order that a stylesheet-based
 * `display: none` would remove it from.
 *
 * Inline rather than in a stylesheet so hiding never depends on a file the
 * page did not load.
 */
export const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};
