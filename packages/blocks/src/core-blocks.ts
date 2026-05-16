import type { BlockSpec } from "./types.js";
import { columnBlock } from "./columns/column.js";
import { columnsBlock } from "./columns/index.js";
import { groupBlock } from "./group/index.js";
import { headingBlock } from "./heading/index.js";
import { paragraphBlock } from "./paragraph/index.js";

/**
 * The canonical list of blocks shipped by `@plumix/blocks`.
 *
 * `buildApp` imports this and seeds the registry — the user's config
 * does not list core blocks because they are always present. To opt
 * out of a core block on a specific field, narrow the per-field
 * allowlist; the spec itself stays registered so existing content
 * continues to round-trip losslessly.
 *
 * Order is purely a readability convention: typography first, then
 * layout primitives, then interactive blocks as they land in
 * subsequent slices.
 */
export const coreBlocks: readonly BlockSpec[] = Object.freeze([
  paragraphBlock,
  headingBlock,
  groupBlock,
  columnsBlock,
  columnBlock,
]);
