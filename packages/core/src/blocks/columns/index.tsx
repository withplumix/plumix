import type { BlockNode } from "../render-block-tree.js";
import { defineBlock } from "../block-registry.js";

/**
 * Two equal columns, each seeded with a paragraph so a fresh row isn't bare.
 */
const DEFAULT_COLUMNS: readonly BlockNode[] = [
  {
    id: "column-1",
    name: "core/column",
    attrs: { content: [{ id: "column-1-text", name: "core/rich-text" }] },
  },
  {
    id: "column-2",
    name: "core/column",
    attrs: { content: [{ id: "column-2-text", name: "core/rich-text" }] },
  },
];

type StackAt = "tablet" | "mobile" | "never";
const DEFAULT_STACK_AT: StackAt = "tablet";

export const columnsBlock = defineBlock({
  name: "core/columns",
  title: { id: "block.core.columns.title", message: "Columns" },
  icon: "Columns",
  category: "layout",
  // selfSeam so `display:flex` + `gap` land on the row itself, making the
  // columns its direct flex items.
  selfSeam: true,
  inputs: [
    {
      name: "stackAt",
      type: "select",
      label: {
        id: "block.core.columns.input.stackAt.label",
        message: "Stack columns at",
      },
      options: [
        {
          label: {
            id: "block.core.columns.input.stackAt.option.tablet",
            message: "Tablet",
          },
          value: "tablet",
        },
        {
          label: {
            id: "block.core.columns.input.stackAt.option.mobile",
            message: "Mobile",
          },
          value: "mobile",
        },
        {
          label: {
            id: "block.core.columns.input.stackAt.option.never",
            message: "Never",
          },
          value: "never",
        },
      ],
    },
    {
      name: "reverseWhenStacked",
      type: "boolean",
      label: {
        id: "block.core.columns.input.reverseWhenStacked.label",
        message: "Reverse when stacked",
      },
    },
    {
      name: "columns",
      type: "slot",
      label: {
        id: "block.core.columns.input.columns.label",
        message: "Columns",
      },
      allowedBlocks: ["core/column"],
      defaultChildren: DEFAULT_COLUMNS,
    },
  ],
  defaults: { stackAt: DEFAULT_STACK_AT },
  // A flex row with a gap. Responsive stacking rides a scoped media query keyed
  // off `stackAt` (see the view), not a seeded bucket, so the preset owns it.
  defaultStyles: {
    large: { display: "flex", gap: "20px", alignItems: "stretch" },
  },
  view: () => import("./columns.view.js"),
});
