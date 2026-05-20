import type { BlockSpec } from "./types.js";
import { codeBlock } from "./code/index.js";
import { columnBlock } from "./columns/column.js";
import { columnsBlock } from "./columns/index.js";
import { groupBlock } from "./group/index.js";
import { listItemBlock } from "./list/list-item.js";
import { listOrderedBlock } from "./list/list-ordered.js";
import { listBlock } from "./list/list.js";
import { paragraphBlock } from "./paragraph/index.js";
import { quoteBlock } from "./quote/index.js";
import { separatorBlock } from "./separator/index.js";

/**
 * The canonical list of blocks shipped by `@plumix/blocks`.
 *
 * `buildApp` imports this and seeds the OLD layered registry — the user's
 * config does not list core blocks because they are always present. To opt
 * out of a core block on a specific field, narrow the per-field allowlist;
 * the spec itself stays registered so existing content continues to round-trip
 * losslessly.
 *
 * Order is purely a readability convention: typography → layout →
 * interactive → structured, in the order slices land.
 *
 * Blocks migrated to the new `defineBlock` surface are intentionally
 * absent here. Entries with those `core/*` names do not round-trip
 * through `EntryContent` on this feature branch; round-trip is restored
 * at cutover (#405) when the old walker + registry are deleted.
 */
export const coreBlocks: readonly BlockSpec[] = Object.freeze([
  paragraphBlock,
  quoteBlock,
  separatorBlock,
  codeBlock,
  listBlock,
  listOrderedBlock,
  listItemBlock,
  groupBlock,
  columnsBlock,
  columnBlock,
]);
