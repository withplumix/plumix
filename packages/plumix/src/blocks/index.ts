/**
 * Public `plumix/blocks` surface.
 *
 * Re-exports the curated public API from the workspace-internal
 * `@plumix/blocks` package. Consumers (plugins, themes, the user's app)
 * import from `plumix/blocks`; `@plumix/blocks` is never a direct
 * dependency in their `package.json`.
 */

export {
  BlockContentValidationError,
  coreBlocks,
  coreMarks,
  createBlockRegistry,
  defineBlock,
  isEntryContent,
  isBlockNodeArray,
  renderBlockTree,
  richTextBlock,
  resolveBlockTransforms,
  expandBlockVariations,
  validateEntryContent,
  // Re-exported for the SSR shim the Vite plugin generates for
  // `"use client"` modules. Not intended for direct consumption.
  serializeProps,
} from "@plumix/blocks";
export type { IslandProps, PlumixStrategy } from "@plumix/blocks";
export type {
  BlockContext,
  BlockInput,
  BlockInputOption,
  BlockNode,
  BlockNodeComponent,
  BlockNodeRenderProps,
  BlockRegistry,
  BlockRenderHooks,
  BlockSpec,
  BlockTransformFrom,
  BlockTransformTo,
  BlockTransforms,
  BlockVariation,
  EntryContent,
  InsertableBlockEntry,
  MarkSpec,
  RenderBlockTreeOptions,
  ResolvedTransformTarget,
} from "@plumix/blocks";
