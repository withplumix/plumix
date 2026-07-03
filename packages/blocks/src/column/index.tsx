import type { CSSProperties, ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

// A bare CSS length/percentage — the only shape a column width may take. Keeps
// the value inert when spread into an inline `flex` style.
const SAFE_WIDTH = /^\d+(\.\d+)?(px|%|rem|em|vw|vh|ch)$/;

// A fixed width pins the column's flex (no grow/shrink) so it overrides the
// class-level equal-split default; an unset or unsafe width leaves it equal.
function columnFlex(width: unknown): CSSProperties | undefined {
  if (typeof width !== "string") return undefined;
  const value = width.trim();
  return SAFE_WIDTH.test(value) ? { flex: `0 0 ${value}` } : undefined;
}

export const columnBlock = defineBlock({
  name: "core/column",
  title: "Column",
  icon: "RectangleVertical",
  category: "layout",
  // selfSeam so the block's own div is the flex item — its width/flex styles
  // land on it directly, not on a wrapper. Only ever a child of core/columns.
  selfSeam: true,
  requiresParent: ["core/columns"],
  inputs: [
    { name: "width", type: "text", label: "Width" },
    {
      name: "content",
      type: "slot",
      label: "Content",
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
