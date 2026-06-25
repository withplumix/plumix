import type { BlockSpec } from "./block-registry.js";
import { buttonBlock } from "./button/index.js";
import { buttonsBlock } from "./buttons/index.js";
import { calloutBlock } from "./callout/index.js";
import { codeBlock } from "./code/index.js";
import { columnsBlock } from "./columns/index.js";
import { detailsBlock } from "./details/index.js";
import { groupBlock } from "./group/index.js";
import { patternRefBlock } from "./pattern-ref/index.js";
import { richTextBlock } from "./rich-text/index.js";
import { separatorBlock } from "./separator/index.js";
import { spacerBlock } from "./spacer/index.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./table/index.js";

export const coreBlocks: readonly BlockSpec[] = Object.freeze([
  richTextBlock,
  separatorBlock,
  spacerBlock,
  codeBlock,
  groupBlock,
  columnsBlock,
  buttonsBlock,
  buttonBlock,
  detailsBlock,
  calloutBlock,
  tableBlock,
  tableHeaderRowBlock,
  tableBodyRowBlock,
  tableHeaderCellBlock,
  tableCellBlock,
  patternRefBlock,
]);
