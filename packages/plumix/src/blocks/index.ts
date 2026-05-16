/**
 * Public `plumix/blocks` surface.
 *
 * Re-exports the curated public API from the workspace-internal
 * `@plumix/blocks` package. Consumers (plugins, themes, the user's app)
 * import from `plumix/blocks`; `@plumix/blocks` is never a direct
 * dependency in their `package.json`.
 *
 * Mirrors the convention already used by `plumix/theme` re-exporting
 * `defineTheme` from `@plumix/core`.
 */

export {
  BlockRegistrationError,
  EntryContent,
  coreBlocks,
  defineBlock,
  mergeBlockRegistry,
  paragraphBlock,
} from "@plumix/blocks";
export type {
  BlockAttributeSchema,
  BlockComponent,
  BlockContext,
  BlockProps,
  BlockRegistry,
  BlockSpec,
  EntryContentProps,
  LazyRef,
  MergeBlockRegistryInput,
  ResolvedBlockSpec,
  TiptapMark,
  TiptapNode,
} from "@plumix/blocks";
