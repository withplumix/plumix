import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const ALIGNS = ["left", "center", "right"] as const;
type Align = (typeof ALIGNS)[number];

function pickAlign(raw: unknown): Align | undefined {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as Align)
    : undefined;
}

export const tableBlockV2 = defineBlock({
  name: "core/table",
  title: "Table",
  icon: "Table",
  category: "text",
  inputs: [
    { name: "striped", type: "checkbox", label: "Striped" },
    { name: "bordered", type: "checkbox", label: "Bordered" },
    { name: "rows", type: "slot", label: "Rows" },
  ],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const striped = attrs.striped === true || undefined;
    const bordered = attrs.bordered === true || undefined;
    const Rows = attrs.rows as (() => ReactNode) | undefined;
    return (
      <table data-striped={striped} data-bordered={bordered}>
        {Rows ? <Rows /> : null}
      </table>
    );
  },
});

export const tableHeaderRowBlockV2 = defineBlock({
  name: "core/table-header-row",
  title: "Header Row",
  icon: "Rows",
  category: "text",
  inline: true,
  inputs: [{ name: "cells", type: "slot", label: "Cells" }],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const Cells = attrs.cells as (() => ReactNode) | undefined;
    return <tr data-header="">{Cells ? <Cells /> : null}</tr>;
  },
});

export const tableBodyRowBlockV2 = defineBlock({
  name: "core/table-body-row",
  title: "Body Row",
  icon: "Rows",
  category: "text",
  inline: true,
  inputs: [{ name: "cells", type: "slot", label: "Cells" }],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const Cells = attrs.cells as (() => ReactNode) | undefined;
    return <tr>{Cells ? <Cells /> : null}</tr>;
  },
});

export const tableHeaderCellBlockV2 = defineBlock({
  name: "core/table-header-cell",
  title: "Header Cell",
  icon: "AlignLeft",
  category: "text",
  inline: true,
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
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    const align = pickAlign(attrs.align);
    return (
      <th scope="col" data-align={align}>
        {text}
      </th>
    );
  },
});

export const tableCellBlockV2 = defineBlock({
  name: "core/table-cell",
  title: "Cell",
  icon: "AlignLeft",
  category: "text",
  inline: true,
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
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    const align = pickAlign(attrs.align);
    return <td data-align={align}>{text}</td>;
  },
});
