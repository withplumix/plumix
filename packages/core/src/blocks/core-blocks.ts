import type { BlockSpec } from "./block-registry.js";
import { buttonBlock } from "./button/index.js";
import { codeBlock } from "./code/index.js";
import { columnBlock } from "./column/index.js";
import { columnsBlock } from "./columns/index.js";
import { detailsBlock } from "./details/index.js";
import { embedBlock } from "./embed/index.js";
import { groupBlock } from "./group/index.js";
import { htmlBlock } from "./html/index.js";
import { richTextBlock } from "./rich-text/index.js";
import { sectionBlock } from "./section/index.js";
import { separatorBlock } from "./separator/index.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./table/index.js";
import { videoBlock } from "./video/index.js";

/** The names of {@link coreBlocks}, so a theme's `allowedBlocks` autocompletes them. */
export type CoreBlockName =
  | "core/rich-text"
  | "core/separator"
  | "core/code"
  | "core/group"
  | "core/section"
  | "core/columns"
  | "core/column"
  | "core/button"
  | "core/details"
  | "core/video"
  | "core/embed"
  | "core/html"
  | "core/table"
  | "core/table-header-row"
  | "core/table-body-row"
  | "core/table-header-cell"
  | "core/table-cell";

/**
 * `core/html` belongs here: a site can't register it itself, because
 * `isReservedBlockName` rejects every `core/` name.
 */
export const coreBlocks: readonly BlockSpec[] = Object.freeze([
  richTextBlock,
  separatorBlock,
  codeBlock,
  groupBlock,
  sectionBlock,
  columnsBlock,
  columnBlock,
  buttonBlock,
  detailsBlock,
  videoBlock,
  embedBlock,
  htmlBlock,
  tableBlock,
  tableHeaderRowBlock,
  tableBodyRowBlock,
  tableHeaderCellBlock,
  tableCellBlock,
]);
