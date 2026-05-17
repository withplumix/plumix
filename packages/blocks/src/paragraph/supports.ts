import type { BlockSupports } from "../styles/types.js";

/**
 * `core/paragraph` opts into every Inspector control path. Used by
 * both the spec declaration and the frontend Component so the Inspector
 * and the renderer agree on which axes to resolve.
 */
export const paragraphSupports: BlockSupports = {
  color: { background: true, text: true },
  spacing: { padding: true, margin: true },
  typography: {
    fontSize: true,
    lineHeight: true,
    fontWeight: true,
    textAlign: true,
  },
  anchor: true,
  customClassName: true,
};
