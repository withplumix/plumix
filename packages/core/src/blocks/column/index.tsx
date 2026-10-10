import type { CSSProperties, ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

/**
 * A bare CSS length/percentage — the only shape a column width may take. Keeps
 * the value inert when spread into an inline `flex` style.
 */
const SAFE_WIDTH = /^\d+(\.\d+)?(px|%|rem|em|vw|vh|ch)$/;

/**
 * Shrink but not grow, so several fixed widths fit the row instead of
 * overflowing it. A bare number is a percent, matching Builder's column width.
 */
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
  render: ({ attrs, blockProps }): ReactNode => {
    const Content = attrs.content as (() => ReactNode) | undefined;
    return (
      <div {...blockProps} style={columnFlex(attrs.width)}>
        {Content ? <Content /> : null}
      </div>
    );
  },
});
