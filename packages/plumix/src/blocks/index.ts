/**
 * Public `plumix/blocks` surface.
 *
 * Re-exports the curated public API from the workspace-internal
 * `@plumix/blocks` package. Consumers (plugins, themes, the user's app)
 * import from `plumix/blocks`; `@plumix/blocks` is never a direct
 * dependency in their `package.json`.
 *
 * The block *value* API (`defineBlock`, `renderBlockTree`, …) is imported
 * from here, but the block/pattern type-registries are augmented through the
 * root `plumix` specifier (see `../index.ts`), not `plumix/blocks` —
 * `declare module "plumix" { interface BlockTypeRegistry { … } }`. Type
 * augmentation must go through one specifier or it fractures.
 */

export {
  BlockContentValidationError,
  coreBlocks,
  coreMarks,
  coreShortcodes,
  createBlockRegistry,
  defineBlock,
  defineEntryContent,
  emitThemeTokenCss,
  isEntryContent,
  isBlockNodeArray,
  renderBlockTree,
  resolveThemeTokens,
  richTextBlock,
  resolveBlockTransforms,
  expandBlockVariations,
  validateEntryContent,
  // Re-exported for the SSR shim the Vite plugin generates for
  // `"use client"` modules. Not intended for direct consumption.
  serializeProps,
  IslandShim,
} from "@plumix/blocks";
export type {
  IslandProps,
  PlumixPrefetch,
  PlumixStrategy,
} from "@plumix/blocks";
export type {
  BlockContext,
  BlockInput,
  BlockInputOption,
  BlockLoaderArgs,
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
  MaterializedAttrs,
  RenderBlockTreeOptions,
  ResolvedTransformTarget,
  ShortcodeSpec,
} from "@plumix/blocks";

// The theme's design vocabulary, for a theme typing its own token module and
// for `emitThemeTokenCss`.
export type {
  KnownTokenCategory,
  ResolvedThemeTokens,
  ResolvedTokenGroup,
  ThemeTokenEntry,
  ThemeTokenGroup,
  ThemeTokens,
  TokenCategory,
} from "@plumix/blocks";
