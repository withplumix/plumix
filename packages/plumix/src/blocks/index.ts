/**
 * Public `plumix/blocks` surface.
 *
 * Re-exports the curated public API from the workspace-internal
 * `@plumix/core/blocks` subpath. Consumers (plugins, themes, the user's app)
 * import from `plumix/blocks`; `@plumix/core` is never a direct
 * dependency in their `package.json`.
 *
 * The block *value* API (`defineBlock`, `renderBlockTree`, …) is imported
 * from here, but the block/pattern type-registries are augmented through the
 * root `plumix` specifier (see `../index.ts`), not `plumix/blocks` —
 * `declare module "plumix" { interface BlockTypeRegistry { … } }`. Type
 * augmentation must go through one specifier or it fractures.
 */

import type { AppContext } from "@plumix/core";

// `blocks/` sits in core's foundation layer, below `context/`, so it cannot
// name the context its loaders receive. This façade reaches both, so it fills
// the seam here, and the augmentation ships in this entry's `.d.ts` to every
// program that imports a loader type from `plumix/blocks`.
// eslint-disable-next-line no-restricted-syntax -- the façade filling a seam it owns, not a consumer registry augmentation (consumers augment only "plumix")
declare module "@plumix/core/blocks" {
  interface BlockLoaderContextRegistry {
    readonly ctx: AppContext;
  }
}

export {
  BlockContentValidationError,
  blockSlotKeys,
  blockTextRoster,
  blockTextVersion,
  coreBlocks,
  coreMarks,
  coreShortcodes,
  createBlockRegistry,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
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
  extractBlockText,
  validateEntryContent,
  // Re-exported for the SSR shim the Vite plugin generates for
  // `"use client"` modules. Not intended for direct consumption.
  serializeProps,
  IslandShim,
} from "@plumix/core/blocks";
export type {
  IslandProps,
  PlumixPrefetch,
  PlumixStrategy,
} from "@plumix/core/blocks";
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
  BlockTextInput,
  BlockTextRoster,
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
} from "@plumix/core/blocks";

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
} from "@plumix/core/blocks";
