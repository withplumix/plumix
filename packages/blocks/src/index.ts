/**
 * Public API of `@plumix/blocks`.
 *
 * Re-exported from `plumix/blocks` (see `packages/plumix/src/blocks/`).
 * Consumers should import from `plumix/blocks`, not from this package
 * directly — `@plumix/blocks` is workspace-internal and unpublished.
 */

export { defineBlock } from "./define-block.js";
export { BlockRegistrationError } from "./errors.js";
export { mergeBlockRegistry } from "./registry.js";
export type { MergeBlockRegistryInput } from "./registry.js";
export { EntryContent } from "./walker.js";
export type { EntryContentProps } from "./walker.js";
export type {
  BlockAttributeSchema,
  BlockComponent,
  BlockContext,
  BlockProps,
  BlockRegistry,
  BlockSpec,
  LazyRef,
  ResolvedBlockSpec,
  TiptapMark,
  TiptapNode,
} from "./types.js";

export { coreBlocks } from "./core-blocks.js";
export { buttonBlock } from "./button/index.js";
export { buttonsBlock } from "./buttons/index.js";
export { calloutBlock } from "./callout/index.js";
export { columnBlock } from "./columns/column.js";
export { columnsBlock } from "./columns/index.js";
export { descriptionDetailBlock } from "./description-list/description-detail.js";
export { descriptionTermBlock } from "./description-list/description-term.js";
export { descriptionListBlock } from "./description-list/index.js";
export { detailsBlock } from "./details/index.js";
export { groupBlock } from "./group/index.js";
export { headingBlock } from "./heading/index.js";
export { listItemBlock } from "./list/list-item.js";
export { listOrderedBlock } from "./list/list-ordered.js";
export { listBlock } from "./list/list.js";
export { paragraphBlock } from "./paragraph/index.js";
