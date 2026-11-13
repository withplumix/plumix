import type { CSSProperties, ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

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

export default function ColumnView({
  attrs,
  blockProps,
}: BlockViewProps): ReactNode {
  const Content = attrs.content as (() => ReactNode) | undefined;
  return (
    <div {...blockProps} style={columnFlex(attrs.width)}>
      {Content ? <Content /> : null}
    </div>
  );
}
