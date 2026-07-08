import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Mirror of `@plumix/blocks`' core block-spec descriptor ids so
// admin-editor's `lingui extract` picks them up into `locales/en.po`
// (and the per-locale translation catalogs). `@plumix/blocks` has no
// catalog of its own; actual rendering resolves each descriptor from
// the block spec at runtime — this module isn't imported elsewhere.
// Keep ids and messages in lockstep with the descriptor literals in
// `packages/blocks/src/*/index.tsx`.

export const BLOCK_DESCRIPTORS = {
  sectionTitle: defineMessage({
    id: "block.core.section.title",
    message: "Section",
  }),
  sectionInputMaxWidthLabel: defineMessage({
    id: "block.core.section.input.maxWidth.label",
    message: "Content max width",
  }),
  sectionInputContentLabel: defineMessage({
    id: "block.core.section.input.content.label",
    message: "Content",
  }),

  videoTitle: defineMessage({
    id: "block.core.video.title",
    message: "Video",
  }),
  videoDescription: defineMessage({
    id: "block.core.video.description",
    message: "HTML <video> with browser controls.",
  }),
  videoKeywordMovie: defineMessage({
    id: "block.core.video.keyword.movie",
    message: "movie",
  }),
  videoKeywordClip: defineMessage({
    id: "block.core.video.keyword.clip",
    message: "clip",
  }),
  videoKeywordMedia: defineMessage({
    id: "block.core.video.keyword.media",
    message: "media",
  }),
  videoInputSrcLabel: defineMessage({
    id: "block.core.video.input.src.label",
    message: "Source URL",
  }),
  videoInputPosterLabel: defineMessage({
    id: "block.core.video.input.poster.label",
    message: "Poster image URL",
  }),
  videoInputControlsLabel: defineMessage({
    id: "block.core.video.input.controls.label",
    message: "Show controls",
  }),
  videoInputAutoplayLabel: defineMessage({
    id: "block.core.video.input.autoplay.label",
    message: "Autoplay",
  }),
  videoInputLoopLabel: defineMessage({
    id: "block.core.video.input.loop.label",
    message: "Loop",
  }),
  videoInputMutedLabel: defineMessage({
    id: "block.core.video.input.muted.label",
    message: "Muted",
  }),
  videoInputPlaysinlineLabel: defineMessage({
    id: "block.core.video.input.playsinline.label",
    message: "Plays inline (iOS)",
  }),

  embedTitle: defineMessage({
    id: "block.core.embed.title",
    message: "Embed",
  }),
  embedDescription: defineMessage({
    id: "block.core.embed.description",
    message:
      "Embed a YouTube, Vimeo, Loom, Spotify, or CodePen URL — or any other page in a sandboxed iframe.",
  }),
  embedKeywordIframe: defineMessage({
    id: "block.core.embed.keyword.iframe",
    message: "iframe",
  }),
  embedKeywordVideo: defineMessage({
    id: "block.core.embed.keyword.video",
    message: "video",
  }),
  embedKeywordYoutube: defineMessage({
    id: "block.core.embed.keyword.youtube",
    message: "youtube",
  }),
  embedKeywordVimeo: defineMessage({
    id: "block.core.embed.keyword.vimeo",
    message: "vimeo",
  }),
  embedKeywordMedia: defineMessage({
    id: "block.core.embed.keyword.media",
    message: "media",
  }),
  embedInputUrlLabel: defineMessage({
    id: "block.core.embed.input.url.label",
    message: "URL",
  }),
  embedInputTitleLabel: defineMessage({
    id: "block.core.embed.input.title.label",
    message: "Accessible title",
  }),
  embedInputCaptionLabel: defineMessage({
    id: "block.core.embed.input.caption.label",
    message: "Caption",
  }),

  separatorTitle: defineMessage({
    id: "block.core.separator.title",
    message: "Separator",
  }),

  codeTitle: defineMessage({
    id: "block.core.code.title",
    message: "Code",
  }),
  codeInputTextLabel: defineMessage({
    id: "block.core.code.input.text.label",
    message: "Code",
  }),
  codeInputLanguageLabel: defineMessage({
    id: "block.core.code.input.language.label",
    message: "Language",
  }),

  htmlTitle: defineMessage({
    id: "block.core.html.title",
    message: "HTML",
  }),
  htmlInputHtmlLabel: defineMessage({
    id: "block.core.html.input.html.label",
    message: "HTML",
  }),

  groupTitle: defineMessage({
    id: "block.core.group.title",
    message: "Box",
  }),
  groupInputContentLabel: defineMessage({
    id: "block.core.group.input.content.label",
    message: "Content",
  }),

  columnTitle: defineMessage({
    id: "block.core.column.title",
    message: "Column",
  }),
  columnInputWidthLabel: defineMessage({
    id: "block.core.column.input.width.label",
    message: "Width",
  }),
  columnInputContentLabel: defineMessage({
    id: "block.core.column.input.content.label",
    message: "Content",
  }),

  buttonTitle: defineMessage({
    id: "block.core.button.title",
    message: "Button",
  }),
  buttonInputLabelLabel: defineMessage({
    id: "block.core.button.input.label.label",
    message: "Label",
  }),
  buttonInputHrefLabel: defineMessage({
    id: "block.core.button.input.href.label",
    message: "Href",
  }),
  buttonInputOpenInNewTabLabel: defineMessage({
    id: "block.core.button.input.openInNewTab.label",
    message: "Open in new tab",
  }),

  tableInputAlignLabel: defineMessage({
    id: "block.core.table.input.align.label",
    message: "Align",
  }),
  tableInputAlignPlaceholder: defineMessage({
    id: "block.core.table.input.align.placeholder",
    message: "Left",
  }),
  tableInputAlignOptionLeft: defineMessage({
    id: "block.core.table.input.align.option.left",
    message: "Left",
  }),
  tableInputAlignOptionCenter: defineMessage({
    id: "block.core.table.input.align.option.center",
    message: "Center",
  }),
  tableInputAlignOptionRight: defineMessage({
    id: "block.core.table.input.align.option.right",
    message: "Right",
  }),
  tableTitle: defineMessage({
    id: "block.core.table.title",
    message: "Table",
  }),
  tableInputRowsLabel: defineMessage({
    id: "block.core.table.input.rows.label",
    message: "Rows",
  }),

  tableHeaderRowTitle: defineMessage({
    id: "block.core.table-header-row.title",
    message: "Header Row",
  }),
  tableHeaderRowInputCellsLabel: defineMessage({
    id: "block.core.table-header-row.input.cells.label",
    message: "Cells",
  }),

  tableBodyRowTitle: defineMessage({
    id: "block.core.table-body-row.title",
    message: "Body Row",
  }),
  tableBodyRowInputCellsLabel: defineMessage({
    id: "block.core.table-body-row.input.cells.label",
    message: "Cells",
  }),

  tableHeaderCellTitle: defineMessage({
    id: "block.core.table-header-cell.title",
    message: "Header Cell",
  }),
  tableHeaderCellInputTextLabel: defineMessage({
    id: "block.core.table-header-cell.input.text.label",
    message: "Text",
  }),

  tableCellTitle: defineMessage({
    id: "block.core.table-cell.title",
    message: "Cell",
  }),
  tableCellInputTextLabel: defineMessage({
    id: "block.core.table-cell.input.text.label",
    message: "Text",
  }),

  columnsTitle: defineMessage({
    id: "block.core.columns.title",
    message: "Columns",
  }),
  columnsInputStackAtLabel: defineMessage({
    id: "block.core.columns.input.stackAt.label",
    message: "Stack columns at",
  }),
  columnsInputStackAtOptionTablet: defineMessage({
    id: "block.core.columns.input.stackAt.option.tablet",
    message: "Tablet",
  }),
  columnsInputStackAtOptionMobile: defineMessage({
    id: "block.core.columns.input.stackAt.option.mobile",
    message: "Mobile",
  }),
  columnsInputStackAtOptionNever: defineMessage({
    id: "block.core.columns.input.stackAt.option.never",
    message: "Never",
  }),
  columnsInputReverseWhenStackedLabel: defineMessage({
    id: "block.core.columns.input.reverseWhenStacked.label",
    message: "Reverse when stacked",
  }),
  columnsInputColumnsLabel: defineMessage({
    id: "block.core.columns.input.columns.label",
    message: "Columns",
  }),

  richTextTitle: defineMessage({
    id: "block.core.rich-text.title",
    message: "Rich text",
  }),
  richTextKeywordParagraph: defineMessage({
    id: "block.core.rich-text.keyword.paragraph",
    message: "paragraph",
  }),
  richTextKeywordText: defineMessage({
    id: "block.core.rich-text.keyword.text",
    message: "text",
  }),
  richTextKeywordBody: defineMessage({
    id: "block.core.rich-text.keyword.body",
    message: "body",
  }),
  richTextInputBodyLabel: defineMessage({
    id: "block.core.rich-text.input.body.label",
    message: "Body",
  }),

  patternRefTitle: defineMessage({
    id: "block.core.pattern-ref.title",
    message: "Pattern reference",
  }),
  patternRefInputSlugLabel: defineMessage({
    id: "block.core.pattern-ref.input.slug.label",
    message: "Slug",
  }),

  detailsTitle: defineMessage({
    id: "block.core.details.title",
    message: "Details",
  }),
  detailsInputSummaryLabel: defineMessage({
    id: "block.core.details.input.summary.label",
    message: "Summary",
  }),
  detailsInputOpenLabel: defineMessage({
    id: "block.core.details.input.open.label",
    message: "Open by default",
  }),
  detailsInputContentLabel: defineMessage({
    id: "block.core.details.input.content.label",
    message: "Content",
  }),
} satisfies Record<string, MessageDescriptor>;
