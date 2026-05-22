import type { BlockSpec } from "./block-registry.js";
import { buttonBlock } from "./button/index.js";
import { buttonsBlock } from "./buttons/index.js";
import { calloutBlock } from "./callout/index.js";
import { codeBlock } from "./code/index.js";
import { columnsBlock } from "./columns/index.js";
import {
  descriptionDetailBlock,
  descriptionListBlock,
  descriptionTermBlock,
} from "./description-list/index.js";
import { detailsBlock } from "./details/index.js";
import { groupBlock } from "./group/index.js";
import { headingBlock } from "./heading/index.js";
import { listBlock, listItemBlock } from "./list/index.js";
import { paragraphBlock } from "./paragraph/index.js";
import { quoteBlock } from "./quote/index.js";
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
  headingBlock,
  paragraphBlock,
  richTextBlock,
  quoteBlock,
  separatorBlock,
  spacerBlock,
  codeBlock,
  listBlock,
  listItemBlock,
  descriptionListBlock,
  descriptionTermBlock,
  descriptionDetailBlock,
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
]);
