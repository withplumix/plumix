import type { BlockSupports } from "../styles/types.js";

/**
 * `core/heading` opts into the same supports surface as paragraph,
 * minus margin (most theme designs control heading vertical rhythm
 * via the typography scale, not per-instance margin).
 */
export const headingSupports: BlockSupports = {
  color: { background: true, text: true },
  spacing: { padding: true },
  typography: {
    fontSize: true,
    lineHeight: true,
    fontWeight: true,
    textAlign: true,
  },
  anchor: true,
  customClassName: true,
};
