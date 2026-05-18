/**
 * Public API of `@plumix/blocks`.
 *
 * Re-exported from `plumix/blocks` (see `packages/plumix/src/blocks/`).
 * Consumers should import from `plumix/blocks`, not from this package
 * directly — `@plumix/blocks` is workspace-internal and unpublished.
 */

export { defineBlock } from "./define-block.js";
export { BlockRegistrationError } from "./errors.js";
export { EMPTY_BLOCK_REGISTRY, mergeBlockRegistry } from "./registry.js";
export type { MergeBlockRegistryInput } from "./registry.js";
export { resolveTransformTargets } from "./transforms.js";
export { unknownBlockSchema } from "./unknown-node.js";
export { BASELINE_HTML_ALLOWLIST, sanitizeHtml } from "./html/sanitize.js";
export type { HtmlAllowlist } from "./html/sanitize.js";
export { buildHtmlAllowlist } from "./html/build-allowlist.js";
export type { HtmlAllowlistOverride } from "./html/build-allowlist.js";
export { HtmlAllowlistProvider, useHtmlAllowlist } from "./html/context.js";
export { validateBlockContent } from "./validate-content.js";
export type { BlockContentValidationResult } from "./validate-content.js";
export { BlockContentValidationError } from "./validation-errors.js";
export type {
  BlockContentValidationCode,
  BlockContentValidationIssue,
} from "./validation-errors.js";
export { resolveBlockStyles } from "./styles/resolve-block-styles.js";
export type { ResolvedBlockStyles } from "./styles/resolve-block-styles.js";
export {
  ThemeTokensProvider,
  useBlockStyles,
  useThemeTokens,
} from "./styles/hooks.js";
export type { ThemeTokensProviderProps } from "./styles/hooks.js";
export { tokensToCss } from "./styles/tokens-to-css.js";
export type {
  BlockStyleSlot,
  BlockSupports,
  ThemeTokenEntry,
  ThemeTokenGroup,
  ThemeTokens,
} from "./styles/types.js";
export { EntryContent } from "./walker.js";
export type {
  BlockRenderHookContext,
  EntryContentProps,
  SyncFilterExecutor,
} from "./walker.js";
export { collectActiveIslands } from "./islands.js";
export type { ActiveIsland } from "./islands.js";
export { PlumixIslandBootstrap } from "./island-bootstrap.js";
export type { PlumixIslandBootstrapProps } from "./island-bootstrap.js";
export type {
  BlockAttributeSchema,
  BlockComponent,
  BlockContext,
  BlockProps,
  BlockRegistry,
  BlockKeyboardShortcut,
  BlockMarkdownShortcut,
  BlockShortcutMode,
  BlockSpec,
  BlockTransformFrom,
  BlockTransformTo,
  BlockTransforms,
  BlockVariation,
  BlockVariationInnerBlock,
  ClientIslandRef,
  LazyRef,
  ParsePasteRule,
  ResolvedBlockSpec,
  TiptapMark,
  TiptapNode,
} from "./types.js";

export { defineMark } from "./marks/define-mark.js";
export { MarkRegistrationError } from "./marks/errors.js";
export { EMPTY_MARK_REGISTRY, mergeMarkRegistry } from "./marks/registry.js";
export type { MergeMarkRegistryInput } from "./marks/registry.js";
export type {
  MarkComponent,
  MarkProps,
  MarkRegistry,
  MarkSpec,
  ResolvedMarkSpec,
} from "./marks/types.js";
export { coreMarks } from "./marks/core/index.js";

export { coreBlocks } from "./core-blocks.js";
export { buttonBlock } from "./button/index.js";
export { buttonsBlock } from "./buttons/index.js";
export { calloutBlock } from "./callout/index.js";
export { codeBlock } from "./code/index.js";
export { columnBlock } from "./columns/column.js";
export { columnsBlock } from "./columns/index.js";
export { descriptionDetailBlock } from "./description-list/description-detail.js";
export { descriptionTermBlock } from "./description-list/description-term.js";
export { descriptionListBlock } from "./description-list/index.js";
export { detailsBlock } from "./details/index.js";
export { groupBlock } from "./group/index.js";
export { headingBlock } from "./heading/index.js";
export { htmlBlock } from "./html/index.js";
export { listItemBlock } from "./list/list-item.js";
export { listOrderedBlock } from "./list/list-ordered.js";
export { listBlock } from "./list/list.js";
export { paragraphBlock } from "./paragraph/index.js";
export { quoteBlock } from "./quote/index.js";
export { separatorBlock } from "./separator/index.js";
export { spacerBlock } from "./spacer/index.js";
export {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./table/index.js";
