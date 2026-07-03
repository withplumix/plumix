import type { BlockSpec } from "./block-registry.js";
import { buttonBlock } from "./button/index.js";
import { codeBlock } from "./code/index.js";
import { columnBlock } from "./column/index.js";
import { columnsBlock } from "./columns/index.js";
import { detailsBlock } from "./details/index.js";
import { embedBlock } from "./embed/index.js";
import { groupBlock } from "./group/index.js";
import { patternRefBlock } from "./pattern-ref/index.js";
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
  tableBlock,
  tableHeaderRowBlock,
  tableBodyRowBlock,
  tableHeaderCellBlock,
  tableCellBlock,
  patternRefBlock,
]);
