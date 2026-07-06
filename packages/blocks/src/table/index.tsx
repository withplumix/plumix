import type { ReactNode } from "react";

import type { BlockNode } from "../render-block-tree.js";
import { defineBlock } from "../block-registry.js";

const ALIGNS = ["left", "center", "right"] as const;
type Align = (typeof ALIGNS)[number];

const COLUMN_COUNT = 3;

// A container in defaultChildren must spell out its whole subtree — slot seeding
// doesn't recurse into a nested slot's own defaultChildren — so each seeded row
// lists its cells. Cells carry placeholder text so a dropped table reads as a
// real grid, not an empty strip; the text is ordinary content the user edits.
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

// A header row + two body rows, so a freshly dropped table reads as an editable,
// filled grid and shows both row types up front.
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
  title: "Table",
  icon: "Table",
  category: "text",
  inputs: [
    {
      name: "rows",
      type: "slot",
      label: "Rows",
      rawSlot: true,
      allowedBlocks: ["core/table-header-row", "core/table-body-row"],
      defaultChildren: DEFAULT_ROWS,
    },
  ],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const Rows = attrs.rows as (() => ReactNode) | undefined;
    // Rows render straight into a <tbody> — browsers inject one anyway, so
    // emitting it ourselves keeps the DOM React hydrates against valid (no
    // <tr> directly under <table>). Header rows live here too; `scope="col"`
    // on their cells is what marks them as headers.
    return (
      <table>
        <tbody>{Rows ? <Rows /> : null}</tbody>
      </table>
    );
  },
});

export const tableHeaderRowBlock = defineBlock({
  name: "core/table-header-row",
  title: "Header Row",
  icon: "Rows",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    {
      name: "cells",
      type: "slot",
      label: "Cells",
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
  title: "Body Row",
  icon: "Rows",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    {
      name: "cells",
      type: "slot",
      label: "Cells",
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
  title: "Header Cell",
  icon: "AlignLeft",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    { name: "text", type: "text", label: "Text" },
    {
      name: "align",
      type: "select",
      label: "Align",
      options: ALIGNS.map((a) => ({ label: a, value: a })),
    },
  ],
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
  title: "Cell",
  icon: "AlignLeft",
  category: "text",
  selfSeam: true,
  inserter: false,
  inputs: [
    { name: "text", type: "text", label: "Text" },
    {
      name: "align",
      type: "select",
      label: "Align",
      options: ALIGNS.map((a) => ({ label: a, value: a })),
    },
  ],
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
