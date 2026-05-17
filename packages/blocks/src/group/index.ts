import { defineBlock } from "../define-block.js";

const LAYOUT_OPTIONS = [
  { value: "flow", label: "Flow" },
  { value: "flex-row", label: "Row (flex)" },
  { value: "flex-column", label: "Stack (flex)" },
  { value: "grid", label: "Grid" },
] as const;

export const groupBlock = defineBlock({
  name: "core/group",
  title: "Group",
  category: "layout",
  description: "Generic container that hosts any block-level children.",
  attributes: {
    layout: {
      type: "select",
      label: "Layout",
      default: "flow",
      options: LAYOUT_OPTIONS,
    },
  },
  variations: [
    {
      name: "row",
      title: "Row",
      description: "Horizontal flex container — siblings flow left to right.",
      keywords: ["row", "horizontal", "flex"],
      attributes: { layout: "flex-row" },
    },
    {
      name: "stack",
      title: "Stack",
      description: "Vertical flex container — siblings stack top to bottom.",
      keywords: ["stack", "vertical", "column", "flex"],
      attributes: { layout: "flex-column" },
    },
  ],
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.groupSchema),
  component: () => import("./Component.js").then((m) => m.GroupComponent),
});
