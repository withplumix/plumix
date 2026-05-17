import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const DEFAULT_SUMMARY = "Details";

export function DetailsComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const summary =
    typeof attrs.summary === "string" && attrs.summary.length > 0
      ? attrs.summary
      : DEFAULT_SUMMARY;
  const open = attrs.open === true;
  return (
    <details open={open} data-plumix-block="core/details">
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
