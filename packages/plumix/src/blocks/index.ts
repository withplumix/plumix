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
  BlockContentValidationError,
  BlockRegistrationError,
  EntryContent,
  MarkRegistrationError,
  coreBlocks,
  coreMarks,
  defineBlock,
  defineMark,
  mergeBlockRegistry,
  mergeMarkRegistry,
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
  MarkComponent,
  MarkProps,
  MarkRegistry,
  MarkSpec,
  MergeBlockRegistryInput,
  MergeMarkRegistryInput,
  ResolvedBlockSpec,
  ResolvedMarkSpec,
  TiptapMark,
  TiptapNode,
} from "@plumix/blocks";
