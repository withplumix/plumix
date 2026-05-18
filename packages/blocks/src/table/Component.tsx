import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const ALIGNS = ["left", "center", "right"] as const;
type Align = (typeof ALIGNS)[number];

function pickAlign(raw: unknown): Align | undefined {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as Align)
    : undefined;
}

export function TableComponent({ attrs, children }: BlockProps): ReactElement {
  const striped = attrs.striped === true || undefined;
  const bordered = attrs.bordered === true || undefined;
  return (
    <table
      data-plumix-block="core/table"
      className="plumix-table"
      data-striped={striped}
      data-bordered={bordered}
    >
      {children}
    </table>
  );
}

export function TableHeaderRowComponent({
  children,
}: BlockProps): ReactElement {
  return (
    <tr data-plumix-block="core/table-header-row" data-header="">
      {children}
    </tr>
  );
}

export function TableBodyRowComponent({ children }: BlockProps): ReactElement {
  return <tr data-plumix-block="core/table-body-row">{children}</tr>;
}

export function TableCellComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const align = pickAlign(attrs.align);
  return (
    <td
      data-plumix-block="core/table-cell"
      className="plumix-cell"
      data-align={align}
    >
      {children}
    </td>
  );
}

export function TableHeaderCellComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const align = pickAlign(attrs.align);
  return (
    <th
      scope="col"
      data-plumix-block="core/table-header-cell"
      className="plumix-headerCell"
      data-align={align}
    >
      {children}
    </th>
  );
}
