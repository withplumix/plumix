import type { BlockSpec } from "./block-registry.js";
import { buttonBlockV2 } from "./button/v2.js";
import { buttonsBlockV2 } from "./buttons/v2.js";
import { calloutBlockV2 } from "./callout/v2.js";
import { codeBlockV2 } from "./code/v2.js";
import { columnsBlockV2 } from "./columns/v2.js";
import {
  descriptionDetailBlockV2,
  descriptionListBlockV2,
  descriptionTermBlockV2,
} from "./description-list/v2.js";
import { detailsBlockV2 } from "./details/v2.js";
import { groupBlockV2 } from "./group/v2.js";
import { headingBlock } from "./heading/index.js";
import { listBlockV2, listItemBlockV2 } from "./list/v2.js";
import { paragraphBlockV2 } from "./paragraph/v2.js";
import { quoteBlockV2 } from "./quote/v2.js";
import { separatorBlockV2 } from "./separator/v2.js";
import { spacerBlockV2 } from "./spacer/v2.js";
import {
  tableBlockV2,
  tableBodyRowBlockV2,
  tableCellBlockV2,
  tableHeaderCellBlockV2,
  tableHeaderRowBlockV2,
} from "./table/v2.js";

export const coreBlocksV2: readonly BlockSpec[] = Object.freeze([
  headingBlock,
  paragraphBlockV2,
  quoteBlockV2,
  separatorBlockV2,
  spacerBlockV2,
  codeBlockV2,
  listBlockV2,
  listItemBlockV2,
  descriptionListBlockV2,
  descriptionTermBlockV2,
  descriptionDetailBlockV2,
  groupBlockV2,
  columnsBlockV2,
  buttonsBlockV2,
  buttonBlockV2,
  detailsBlockV2,
  calloutBlockV2,
  tableBlockV2,
  tableHeaderRowBlockV2,
  tableBodyRowBlockV2,
  tableHeaderCellBlockV2,
  tableCellBlockV2,
]);
