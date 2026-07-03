/**
 * Public API of `@plumix/blocks`.
 *
 * Re-exported from `plumix/blocks` (see `packages/plumix/src/blocks/`).
 * Consumers should import from `plumix/blocks`, not from this package
 * directly — `@plumix/blocks` is workspace-internal and unpublished.
 */

// ─── Block registry primitives ──────────────────────────────────────────────
export { createBlockRegistry, defineBlock } from "./block-registry.js";
export type {
  BlockInput,
  BlockInputOption,
  BlockRegistry,
  BlockShortcutMode,
  BlockSpec,
  BlockTransformFrom,
  BlockTransformTo,
  BlockTransforms,
  BlockVariation,
} from "./block-registry.js";

// ─── Walker + render contract ───────────────────────────────────────────────
export {
  DEFAULT_BLOCK_CONTEXT,
  isBlockNodeArray,
  renderBlockTree,
} from "./render-block-tree.js";
export { editAppender } from "./edit-appender.js";
export { freshBlockId, rewriteBlockNodeIds } from "./rewrite-node-ids.js";
export { countProse } from "./count-prose.js";
export type { ProseCount } from "./count-prose.js";
export type {
  BlockContext,
  BlockNode,
  BlockNodeComponent,
  BlockNodeRenderProps,
  BlockRenderHooks,
  RenderBlockTreeOptions,
} from "./render-block-tree.js";

// ─── Entry-content envelope ─────────────────────────────────────────────────
export { defineEntryContent, isEntryContent } from "./entry-content.js";
export type { EntryContent } from "./entry-content.js";

// ─── Per-block SSR loaders ──────────────────────────────────────────────────
export { collectLoaderEntries, resolveBlockLoaders } from "./loaders.js";
export type {
  BlockLoaderArgs,
  BlockLoaderFn,
  BlockLoaderRecord,
  LoaderEntry,
  LoaderErrorEvent,
  ResolveBlockLoadersOptions,
  ResolvedBlockLoaderData,
  ResolvedBlockLoaders,
  ResolvedLoaders,
} from "./loaders.js";

// ─── Transforms + insertable expansion ─────────────────────────────────────
export { resolveBlockTransforms } from "./transforms.js";
export type { ResolvedTransformTarget } from "./transforms.js";
export {
  expandBlockVariations,
  resolveVariationPreview,
} from "./expand-block-variations.js";
export type {
  InsertableBlockEntry,
  VariationPreviewSource,
} from "./expand-block-variations.js";
export type { BlockVariationExample } from "./block-registry.js";

// ─── Pattern registry primitives ────────────────────────────────────────────
export {
  block,
  commitPatterns,
  createPatternRegistry,
  definePattern,
} from "./pattern-registry.js";
export type {
  BlockPattern,
  BlockTypeRegistry,
  PatternCategoryRegistry,
  PatternInsertMode,
  PatternPreview,
  PatternRegistry,
  PatternTarget,
} from "./pattern-registry.js";
export { PatternRegistryError } from "./pattern-errors.js";
export { resolveActiveVariation } from "./resolve-active-variation.js";
export type { BlockVariationIsActive } from "./block-registry.js";
export { serializePatternSource } from "./serialize-pattern-source.js";
export type { SerializePatternSourceOptions } from "./serialize-pattern-source.js";
export { commitBlockVariations } from "./commit-block-variations.js";
export { BlockVariationError } from "./variation-errors.js";
export { resolveBlockScopeVariations } from "./block-scope-variations.js";
export type { BlockVariationScope } from "./block-registry.js";

// ─── Validation ─────────────────────────────────────────────────────────────
export { validateEntryContent } from "./validate-content.js";
export type { BlockContentValidationResult } from "./validate-content.js";
export { BlockContentValidationError } from "./validation-errors.js";
export type {
  BlockContentValidationCode,
  BlockContentValidationIssue,
} from "./validation-errors.js";

// ─── Style emission + theme tokens ──────────────────────────────────────────
export {
  DEFAULT_BREAKPOINTS,
  emitBlockStyleCss,
  normalizeStyleValue,
  tokenCategoryForProperty,
  tokenCssVar,
  tokenIdFromCssVar,
  tokenIdToCssVar,
  VIEWPORT_MAX_PX,
} from "./styles/style-emitter.js";
export type {
  ResponsiveStyleBucket,
  ResponsiveStyleSlot,
  ThemeBreakpoints,
  VisibilityFlags,
} from "./styles/style-emitter.js";
export { sanitizeCssValue } from "./styles/sanitize-css.js";
export { parseLoaderData, serializeLoaderData } from "./loader-data.js";
export { findBlockNode } from "./find-block-node.js";
export type {
  KnownTokenCategory,
  ThemeTokenEntry,
  ThemeTokenGroup,
  ThemeTokens,
  TokenCategory,
} from "./styles/types.js";

// ─── HTML sanitisation ──────────────────────────────────────────────────────
export { isAllowedHtmlAttr, safeHtmlAttrs } from "./html/attrs.js";
export { ROOT_TAGS, resolveRootTag } from "./html/root-tag.js";
export type { RootTag } from "./html/root-tag.js";
export { BASELINE_HTML_ALLOWLIST, sanitizeHtml } from "./html/sanitize.js";
export type { HtmlAllowlist } from "./html/sanitize.js";
export { buildHtmlAllowlist } from "./html/build-allowlist.js";
export type { HtmlAllowlistOverride } from "./html/build-allowlist.js";
export { HtmlAllowlistProvider, useHtmlAllowlist } from "./html/context.js";

// ─── Headings ─────────────────────────────────────────────────────────────
export { HEADING_LEVELS, HEADING_TAGS } from "./headings.js";
export type { HeadingLevel } from "./headings.js";

// ─── Heading audit ──────────────────────────────────────────────────────────
export { analyzeHeadingStructure } from "./heading-audit.js";
export type { HeadingAuditViolation } from "./heading-audit.js";

// ─── Unknown-node Tiptap fallback ──────────────────────────────────────────
export { unknownBlockSchema } from "./unknown-node.js";

// ─── Core blocks ────────────────────────────────────────────────────────────
export { coreBlocks } from "./core-blocks.js";
export { buttonBlock } from "./button/index.js";
export { codeBlock } from "./code/index.js";
export { columnsBlock } from "./columns/index.js";
export { detailsBlock } from "./details/index.js";
export { embedBlock } from "./embed/index.js";
export { groupBlock } from "./group/index.js";
export { htmlBlock } from "./html/index.js";
export { richTextBlock } from "./rich-text/index.js";
export { sectionBlock } from "./section/index.js";
export { separatorBlock } from "./separator/index.js";
export {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./table/index.js";
export { videoBlock } from "./video/index.js";

// ─── Inline marks ───────────────────────────────────────────────────────────
export { coreMarks, coreMarkExtensions } from "./marks/core/index.js";
export type { MarkSpec } from "./marks/types.js";

// ─── Shortcodes ─────────────────────────────────────────────────────────────
// `expandShortcodes` is the single integration point a future
// `@plumix/plugin-seo` reuses to expand macros in meta descriptions.
export { coreShortcodes } from "./shortcodes/core/index.js";
export { expandShortcodes } from "./shortcodes/expand.js";
export { defineShortcode } from "./shortcodes/types.js";
export type {
  ShortcodeContext,
  ShortcodeRegistry,
  ShortcodeRenderProps,
  ShortcodeSpec,
} from "./shortcodes/types.js";

// ─── Islands authoring ──────────────────────────────────────────────────────
export type {
  IslandProps,
  PlumixPrefetch,
  PlumixStrategy,
} from "./island-props.js";
// Re-exported for the SSR shim the Vite plugin emits for `"use client"`
// modules; not intended for direct theme/block-author consumption.
export { serializeProps } from "./serialize.js";
