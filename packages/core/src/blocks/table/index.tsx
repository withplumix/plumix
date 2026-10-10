import type { ReactNode } from "react";

import type { BlockInput } from "../block-registry.js";
import type { BlockNode } from "../render-block-tree.js";
import { defineBlock } from "../block-registry.js";

const ALIGNS = ["left", "center", "right"] as const;
type Align = (typeof ALIGNS)[number];

const COLUMN_COUNT = 3;

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
  options: [
    {
      label: {
        id: "block.core.table.input.align.option.left",
        message: "Left",
      },
      value: "left",
    },
    {
      label: {
        id: "block.core.table.input.align.option.center",
        message: "Center",
      },
      value: "center",
    },
    {
      label: {
        id: "block.core.table.input.align.option.right",
        message: "Right",
      },
      value: "right",
    },
  ],
};

/**
 * React 19 dedupes this in the editor, but the public string render emits one
 * identical copy per table, which is harmless.
 */
const TABLE_THEME_CSS = [
  "table{border-collapse:collapse;width:var(--plumix-table-width,100%)}",
  "th,td{border:var(--plumix-table-border,1px solid #d0d7de);padding:var(--plumix-table-cell-padding,0.5rem 0.75rem);text-align:left;vertical-align:top}",
  "th{background:var(--plumix-table-header-bg,#f6f8fa);font-weight:var(--plumix-table-header-weight,600)}",
  "th[data-align=center],td[data-align=center]{text-align:center}",
  "th[data-align=right],td[data-align=right]{text-align:right}",
].join("");

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

function pickAlign(raw: unknown): Align | undefined {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as Align)
    : undefined;
}

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
  render: ({ attrs }): ReactNode => {
    const Rows = attrs.rows as (() => ReactNode) | undefined;
    // Browsers inject a <tbody> anyway, so emitting it keeps the hydrated DOM
    // valid. Header rows live here too; `scope="col"` marks them.
    return (
      <>
        <style href="plumix-table-theme" precedence="default">
          {TABLE_THEME_CSS}
        </style>
        <table>
          <tbody>{Rows ? <Rows /> : null}</tbody>
        </table>
      </>
    );
  },
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
  render: ({ attrs, blockProps }): ReactNode => {
    const Cells = attrs.cells as (() => ReactNode) | undefined;
    return (
      <tr data-header="" {...blockProps}>
        {Cells ? <Cells /> : null}
      </tr>
    );
  },
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
  render: ({ attrs, blockProps }): ReactNode => {
    const Cells = attrs.cells as (() => ReactNode) | undefined;
    return <tr {...blockProps}>{Cells ? <Cells /> : null}</tr>;
  },
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
      label: {
        id: "block.core.table-header-cell.input.text.label",
        message: "Text",
      },
    },
    ALIGN_INPUT,
  ],
  text: [{ name: "text" }],
  defaults: { text: "" },
  render: ({ attrs, blockProps }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    const align = pickAlign(attrs.align);
    return (
      <th scope="col" data-align={align} {...blockProps}>
        {text}
      </th>
    );
  },
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
      label: { id: "block.core.table-cell.input.text.label", message: "Text" },
    },
    ALIGN_INPUT,
  ],
  text: [{ name: "text" }],
  defaults: { text: "" },
  render: ({ attrs, blockProps }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    const align = pickAlign(attrs.align);
    return (
      <td data-align={align} {...blockProps}>
        {text}
      </td>
    );
  },
});
