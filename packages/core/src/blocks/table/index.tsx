import type { Label } from "../../i18n/label.js";
import type { BlockInput } from "../block-registry.js";
import type { BlockNode } from "../render-block-tree.js";
import type { Align } from "./align.js";
import { defineBlock } from "../block-registry.js";
import { ALIGNS } from "./align.js";

const COLUMN_COUNT = 3;

const ALIGN_LABELS: Readonly<Record<Align, Label>> = {
  left: { id: "block.core.table.input.align.option.left", message: "Left" },
  center: {
    id: "block.core.table.input.align.option.center",
    message: "Center",
  },
  right: { id: "block.core.table.input.align.option.right", message: "Right" },
};

/**
 * Cell text alignment — shared by header and body cells. Left is the default
 * (an unset align), surfaced as the select's placeholder so its trigger reads
 * "Left" instead of blank.
 */
const ALIGN_INPUT: BlockInput = {
  name: "align",
  type: "select",
  label: { id: "block.core.table.input.align.label", message: "Align" },
  placeholder: {
    id: "block.core.table.input.align.placeholder",
    message: "Left",
  },
  options: ALIGNS.map((value) => ({ label: ALIGN_LABELS[value], value })),
};

/**
 * Slot seeding doesn't recurse into a nested slot's defaultChildren, so each
 * row lists its cells. Placeholder text makes a dropped table read as a grid.
 */
function seedCells(
  rowId: string,
  cell: string,
  label: (col: number) => string,
): readonly BlockNode[] {
  return Array.from({ length: COLUMN_COUNT }, (_, i) => ({
    id: `${rowId}-c${i + 1}`,
    name: cell,
    attrs: { text: label(i + 1) },
  }));
}

/**
 * A header row + two body rows, so a freshly dropped table reads as an
 * editable, filled grid and shows both row types up front.
 */
const DEFAULT_ROWS: readonly BlockNode[] = [
  {
    id: "row-header",
    name: "core/table-header-row",
    attrs: {
      cells: seedCells(
        "row-header",
        "core/table-header-cell",
        (col) => `Header ${col}`,
      ),
    },
  },
  {
    id: "row-1",
    name: "core/table-body-row",
    attrs: {
      cells: seedCells("row-1", "core/table-cell", (col) => `Cell ${col}`),
    },
  },
  {
    id: "row-2",
    name: "core/table-body-row",
    attrs: {
      cells: seedCells("row-2", "core/table-cell", (col) => `Cell ${col}`),
    },
  },
];

export const tableBlock = defineBlock({
  name: "core/table",
  title: { id: "block.core.table.title", message: "Table" },
  icon: "Table",
  category: "text",
  inputs: [
    {
      name: "rows",
      type: "slot",
      label: { id: "block.core.table.input.rows.label", message: "Rows" },
      rawSlot: true,
      allowedBlocks: ["core/table-header-row", "core/table-body-row"],
      defaultChildren: DEFAULT_ROWS,
    },
  ],
  defaults: {},
  view: () => import("./table.view.js"),
});

export const tableHeaderRowBlock = defineBlock({
  name: "core/table-header-row",
  title: { id: "block.core.table-header-row.title", message: "Header Row" },
  icon: "Rows",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    {
      name: "cells",
      type: "slot",
      label: {
        id: "block.core.table-header-row.input.cells.label",
        message: "Cells",
      },
      rawSlot: true,
      allowedBlocks: ["core/table-header-cell"],
    },
  ],
  defaults: {},
  view: () => import("./table.view.js"),
});

export const tableBodyRowBlock = defineBlock({
  name: "core/table-body-row",
  title: { id: "block.core.table-body-row.title", message: "Body Row" },
  icon: "Rows",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    {
      name: "cells",
      type: "slot",
      label: {
        id: "block.core.table-body-row.input.cells.label",
        message: "Cells",
      },
      rawSlot: true,
      allowedBlocks: ["core/table-cell"],
    },
  ],
  defaults: {},
  view: () => import("./table.view.js"),
});

export const tableHeaderCellBlock = defineBlock({
  name: "core/table-header-cell",
  title: { id: "block.core.table-header-cell.title", message: "Header Cell" },
  icon: "AlignLeft",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    {
      name: "text",
      type: "text",
      content: true,
      label: {
        id: "block.core.table-header-cell.input.text.label",
        message: "Text",
      },
    },
    ALIGN_INPUT,
  ],
  text: [{ name: "text" }],
  defaults: { text: "" },
  view: () => import("./table.view.js"),
});

export const tableCellBlock = defineBlock({
  name: "core/table-cell",
  title: { id: "block.core.table-cell.title", message: "Cell" },
  icon: "AlignLeft",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    {
      name: "text",
      type: "text",
      content: true,
      label: { id: "block.core.table-cell.input.text.label", message: "Text" },
    },
    ALIGN_INPUT,
  ],
  text: [{ name: "text" }],
  defaults: { text: "" },
  view: () => import("./table.view.js"),
});
