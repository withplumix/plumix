import type { BlockSpec } from "./types.js";
import { buttonBlock } from "./button/index.js";
import { buttonsBlock } from "./buttons/index.js";
import { calloutBlock } from "./callout/index.js";
import { columnBlock } from "./columns/column.js";
import { columnsBlock } from "./columns/index.js";
import { descriptionDetailBlock } from "./description-list/description-detail.js";
import { descriptionTermBlock } from "./description-list/description-term.js";
import { descriptionListBlock } from "./description-list/index.js";
import { detailsBlock } from "./details/index.js";
import { groupBlock } from "./group/index.js";
import { headingBlock } from "./heading/index.js";
import { listItemBlock } from "./list/list-item.js";
import { listOrderedBlock } from "./list/list-ordered.js";
import { listBlock } from "./list/list.js";
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
 * Order is purely a readability convention: typography → layout →
 * interactive → structured, in the order slices land.
 */
export const coreBlocks: readonly BlockSpec[] = Object.freeze([
  paragraphBlock,
  headingBlock,
  listBlock,
  listOrderedBlock,
  listItemBlock,
  descriptionListBlock,
  descriptionTermBlock,
  descriptionDetailBlock,
  groupBlock,
  columnsBlock,
  columnBlock,
  buttonsBlock,
  buttonBlock,
  detailsBlock,
  calloutBlock,
]);
