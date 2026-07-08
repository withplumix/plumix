import type { CSSProperties, ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

// A bare CSS length/percentage — the only shape a column width may take. Keeps
// the value inert when spread into an inline `flex` style.
const SAFE_WIDTH = /^\d+(\.\d+)?(px|%|rem|em|vw|vh|ch)$/;

// A width sets the column's flex-basis and lets it shrink (but not grow), so it
// overrides the equal-split default while staying gap-safe: several fixed
// widths shrink to fit the row instead of overflowing past it, and an unset
// column still grows to fill whatever's left. A bare number is a percent
// (Builder's column width). An unsafe value leaves the column equal.
function columnFlex(width: unknown): CSSProperties | undefined {
  if (typeof width !== "string") return undefined;
  const value = width.trim();
  const normalized = /^\d+(\.\d+)?$/.test(value) ? `${value}%` : value;
  return SAFE_WIDTH.test(normalized)
    ? { flex: `0 1 ${normalized}` }
    : undefined;
}

export const columnBlock = defineBlock({
  name: "core/column",
  title: { id: "block.core.column.title", message: "Column" },
  icon: "RectangleVertical",
  category: "layout",
  // selfSeam so the block's own div is the flex item — its width/flex styles
  // land on it directly, not on a wrapper. Only ever a child of core/columns.
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
  // Equal split by default: grow to share the row evenly (gap-aware, unlike a
  // fixed %), with a zero basis and min-width:0 so content can't force overflow.
  // A per-column width overrides the basis (editable in the Styles tab).
  defaultStyles: {
    large: { flexGrow: "1", flexBasis: "0", minWidth: "0" },
  },
  render: ({ attrs, blockProps }): ReactNode => {
    const Content = attrs.content as (() => ReactNode) | undefined;
    return (
      <div {...blockProps} style={columnFlex(attrs.width)}>
        {Content ? <Content /> : null}
      </div>
    );
  },
});
