import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

const ALIGNS = ["left", "center", "right"] as const;
type Align = (typeof ALIGNS)[number];

/**
 * React 19 dedupes this in the editor, but the public string render emits one
 * identical copy per table, which is harmless.
 */
const TABLE_THEME_CSS = [
  "table{border-collapse:collapse;width:var(--plumix-table-width,100%)}",
  "th,td{border:var(--plumix-table-border,1px solid #d0d7de);padding:var(--plumix-table-cell-padding,0.5rem 0.75rem);text-align:left;vertical-align:top}",
  "th{background:var(--plumix-table-header-bg,#f6f8fa);font-weight:var(--plumix-table-header-weight,600)}",
  "th[data-align=center],td[data-align=center]{text-align:center}",
  "th[data-align=right],td[data-align=right]{text-align:right}",
].join("");

function pickAlign(raw: unknown): Align | undefined {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as Align)
    : undefined;
}

export default function TableView({
  name,
  attrs,
  blockProps,
}: BlockViewProps): ReactNode {
  switch (name) {
    case "core/table-header-row": {
      const Cells = attrs.cells as (() => ReactNode) | undefined;
      return (
        <tr data-header="" {...blockProps}>
          {Cells ? <Cells /> : null}
        </tr>
      );
    }
    case "core/table-body-row": {
      const Cells = attrs.cells as (() => ReactNode) | undefined;
      return <tr {...blockProps}>{Cells ? <Cells /> : null}</tr>;
    }
    case "core/table-header-cell": {
      const { text = "" } = attrs as { readonly text?: string };
      return (
        <th scope="col" data-align={pickAlign(attrs.align)} {...blockProps}>
          {text}
        </th>
      );
    }
    case "core/table-cell": {
      const { text = "" } = attrs as { readonly text?: string };
      return (
        <td data-align={pickAlign(attrs.align)} {...blockProps}>
          {text}
        </td>
      );
    }
    default: {
      const Rows = attrs.rows as (() => ReactNode) | undefined;
      // Browsers inject a <tbody> anyway, so emitting it keeps the hydrated DOM
      // valid. Header rows live here too; `scope="col"` marks them.
      return (
        <>
          <style href="plumix-table-theme" precedence="default">
            {TABLE_THEME_CSS}
          </style>
          <table>
            <tbody>{Rows ? <Rows /> : null}</tbody>
          </table>
        </>
      );
    }
  }
}
