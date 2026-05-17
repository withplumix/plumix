import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

export function QuoteComponent({ attrs, children }: BlockProps): ReactElement {
  const cite =
    typeof attrs.citation === "string" && attrs.citation.length > 0
      ? attrs.citation
      : undefined;
  return (
    <blockquote data-plumix-block="core/quote" cite={cite}>
      {children}
    </blockquote>
  );
}
