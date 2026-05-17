import { defineBlock } from "../define-block.js";

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
] as const;

export const tableBlock = defineBlock({
  name: "core/table",
  title: "Table",
  category: "interactive",
  description: "Tabular data with optional striped + bordered variants.",
  attributes: {
    striped: { type: "boolean", label: "Striped rows", default: false },
    bordered: { type: "boolean", label: "Bordered cells", default: false },
  },
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.tableSchema),
  component: () => import("./Component.js").then((m) => m.TableComponent),
});

export const tableHeaderRowBlock = defineBlock({
  name: "core/table-header-row",
  title: "Header row",
  category: "interactive",
  description: "Header row in a table; children render as <th>.",
  inserter: false,
  schema: () => import("./schema.js").then((m) => m.tableHeaderRowSchema),
  component: () =>
    import("./Component.js").then((m) => m.TableHeaderRowComponent),
});

export const tableBodyRowBlock = defineBlock({
  name: "core/table-body-row",
  title: "Body row",
  category: "interactive",
  description: "Body row in a table.",
  inserter: false,
  schema: () => import("./schema.js").then((m) => m.tableBodyRowSchema),
  component: () =>
    import("./Component.js").then((m) => m.TableBodyRowComponent),
});

export const tableCellBlock = defineBlock({
  name: "core/table-cell",
  title: "Table cell",
  category: "interactive",
  description: "Cell inside a table row.",
  inserter: false,
  attributes: {
    align: {
      type: "select",
      label: "Alignment",
      default: "left",
      options: ALIGN_OPTIONS,
    },
  },
  schema: () => import("./schema.js").then((m) => m.tableCellSchema),
  component: () => import("./Component.js").then((m) => m.TableCellComponent),
});

export const tableHeaderCellBlock = defineBlock({
  name: "core/table-header-cell",
  title: "Table header cell",
  category: "interactive",
  description: "Header cell inside a table header row.",
  inserter: false,
  attributes: {
    align: {
      type: "select",
      label: "Alignment",
      default: "left",
      options: ALIGN_OPTIONS,
    },
  },
  schema: () => import("./schema.js").then((m) => m.tableHeaderCellSchema),
  component: () =>
    import("./Component.js").then((m) => m.TableHeaderCellComponent),
});
