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
  paragraphBlock,
  renderBlockTree,
  resolveBlockTransforms,
  expandBlockVariations,
  validateEntryContent,
} from "@plumix/blocks";
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
