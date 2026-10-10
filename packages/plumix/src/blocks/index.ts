// Block and pattern type registries are augmented through the root `plumix`
// specifier, not this one: type augmentation through two specifiers fractures.

import type { AppContext } from "@plumix/core";

// Core's `blocks/` layer sits below `context/` and cannot name the context its loaders receive,
// so this façade fills the seam.
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
