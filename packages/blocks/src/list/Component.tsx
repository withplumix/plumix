import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

export function ListComponent({ children }: BlockProps): ReactElement {
  return (
    <ul data-plumix-block="core/list" className="plumix-list">
      {children}
    </ul>
  );
}

export function ListOrderedComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  // start === 1 is the implicit default for <ol>; omit the attribute
  // when it matches so themes don't have to special-case canonical
  // numbering.
  const start =
    typeof attrs.start === "number" &&
    Number.isFinite(attrs.start) &&
    attrs.start !== 1
      ? attrs.start
      : undefined;
  const reversed = attrs.reversed === true ? true : undefined;
  return (
    <ol
      data-plumix-block="core/list-ordered"
      className="plumix-listOrdered"
      start={start}
      reversed={reversed}
    >
      {children}
    </ol>
  );
}

export function ListItemComponent({ children }: BlockProps): ReactElement {
  return <li className="plumix-listItem">{children}</li>;
}
