import type { CSSProperties } from "react";

/**
 * The `.sr-only` recipe, inline so hiding never depends on a stylesheet the
 * page didn't load.
 */
export const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};
