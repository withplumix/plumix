import { defineBlock } from "../block-registry.js";

export const columnBlock = defineBlock({
  name: "core/column",
  title: { id: "block.core.column.title", message: "Column" },
  icon: "RectangleVertical",
  category: "layout",
  // The block's own div must be the flex item, not a wrapper.
  selfSeam: true,
  requiresParent: ["core/columns"],
  inputs: [
    {
      name: "width",
      type: "text",
      label: { id: "block.core.column.input.width.label", message: "Width" },
    },
    {
      name: "content",
      type: "slot",
      label: {
        id: "block.core.column.input.content.label",
        message: "Content",
      },
      defaultChildren: [{ id: "column-text", name: "core/rich-text" }],
    },
  ],
  // Grow from a zero basis rather than a fixed % so the split is gap-aware;
  // min-width:0 stops content forcing overflow.
  defaultStyles: {
    large: { flexGrow: "1", flexBasis: "0", minWidth: "0" },
  },
  view: () => import("./column.view.js"),
});
